const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const isObject = require('isobject');

const innerScriptPattern = /(?<!\<\!--[\s])<script.*?src="(.*?)\?__inline".*?>.*?<\/script>/gmi
const innerRawScriptPattern = /(?<!\<\!--[\s])<script.*?src="(.*?)\?__inline_raw".*?>.*?<\/script>/gmi

const getFullTemplatePath = (template, context) => {
    if (template.indexOf('!') === -1) {
        return path.resolve(context, template);
    }

    // If the template use a loader, then remove the loader
    const nonLoaderResult = template.match(/(?:[!])([^\\][^!?]+|[^\\!?])($|\?[^!?\n]+$)/);

    return nonLoaderResult && nonLoaderResult[1] ? nonLoaderResult[1] : '';
};

const getRawTemplate = (template, context) => {
    const result = template.match(/[^\!]*$/);

    return result && result[0] ? getFullTemplatePath(result[0], context) : '';
};

const forEachGlobalPattern = (content, pattern, cb) => {
    let result = pattern.exec(content);
    for (let i = 0; !!result; i++) {
        cb(result, i);
        result = pattern.exec(content);
    }
};

const getAssetJsChunkName = (template, index) => {
    const hashName = crypto.createHash('md5').update(template).digest('hex');
    const chunk = `inner-${hashName}-${index}`;
    return chunk;
}

const getBundleByChunk = (chunks, chunkName) => {
    const targetChunkList = [];
    for (let chunkData of chunks) {
        if (chunkData.name === chunkName) {
            targetChunkList.push(chunkData);
        }
    }

    if (!targetChunkList[0]) {
        return '';
    }

    const filesSet = targetChunkList[0].files;
    const bundle = filesSet.values().next().value;

    return bundle;
};

const getTemplateInPlugins = (plugins) => {
    let template = [];

    plugins && plugins.forEach((plugin) => {
        if (plugin.userOptions && plugin.userOptions.template) {
            template.push(plugin.userOptions.template);
        }
    });

    return template;
};

class InjectInnerWebpackPlugin {
    constructor(htmlWebpackPlugin, options = {}) {
        if (!htmlWebpackPlugin) {
            throw new Error('[InjectInnerWebpackPlugin] HtmlWebpackPlugin option is required');
        }
        this.htmlWebpackPlugin = htmlWebpackPlugin;
        this.context = options.context;
        this.isRemainBundle = options.isRemainBundle || false;
        this.scriptTag = options.scriptTag || null;
        this.template = null;
        if (options.template) {
            this.template = typeof options.template === 'string' ? [options.template] : options.template;
        }

        this.assetListMap = {};
        this.rawAssetListMap = {};
        this.compilationAssets = null;
    }
    apply(compiler) {
        this.setTemplate(compiler);
        this.setInnerEntry(compiler);
        this.replaceInnerSource(compiler);
        if (!this.isRemainBundle) {
            this.clearInnerChunkOutput(compiler);
        }
    }
    setTemplate(compiler) {
        const templateInPlugins = getTemplateInPlugins(compiler.options.plugins);

        if (templateInPlugins.length === 0) {
            throw new Error('[InjectInnerWebpackPlugin] There is no HtmlWebpackPlugin instance which has template option plugin depends on HtmlWebpackPlugin template option');
        }

        this.template = this.template || templateInPlugins;
    }
    // search html '?__inline' script, put script to chunk
    setInnerEntry(compiler) {
        compiler.hooks.entryOption.tap('InjectInnerWebpackPlugin', (context, entry) => {
            if (!isObject(entry)) {
                throw new Error("[InjectInnerWebpackPlugin] webpack entry should be Object");
            }

            const setSingleTemplateEntry = (templateStr) => {
                const template = getFullTemplatePath(templateStr, compiler.context);

                const content = fs.readFileSync(template, {
                    encoding: 'utf8'
                });

                forEachGlobalPattern(content, innerScriptPattern, (result, index) => {
                    const rawScript = result[0];
                    const innerJsUrl = result[1];

                    const scriptEntryPath = this.getScriptEntryPath({
                        innerJsUrl,
                        template,
                        context,
                    });

                    const isExistedScriptEntry = fs.existsSync(scriptEntryPath);
                    if (isExistedScriptEntry) {
                        const chunk = getAssetJsChunkName(template, index);

                        // set inner script to chunk
                        entry[chunk] = {
                            import: [scriptEntryPath],
                        }

                        if (!this.assetListMap[template]) {
                            this.assetListMap[template] = [];
                        }

                        // cache for replaceInnerSource
                        this.assetListMap[template].push({
                            chunk,
                            innerJsUrl,
                            rawScript,
                        });
                    } else {
                        throw new Error(`can't resolve '${scriptEntryPath}' from '${rawScript}' in '${template}'`);
                    }
                });

                forEachGlobalPattern(content, innerRawScriptPattern, (result) => {
                    const rawScript = result[0];
                    const innerJsUrl = result[1];

                    const scriptEntryPath = this.getScriptEntryPath({
                        innerJsUrl,
                        template,
                        context,
                    });

                    const isExistedScriptEntry = fs.existsSync(scriptEntryPath);
                    if (isExistedScriptEntry) {

                        if (!this.rawAssetListMap[template]) {
                            this.rawAssetListMap[template] = [];
                        }

                        // cache for replaceInnerSource
                        this.rawAssetListMap[template].push({
                            scriptEntryPath,
                            innerJsUrl,
                            rawScript,
                        });
                    } else {
                        throw new Error(`can't resolve '${scriptEntryPath}' from '${rawScript}' in '${template}'`);
                    }
                });
            };

            this.template.forEach(setSingleTemplateEntry);
        });
    }
    // get inner script chunk source, and replace html content
    replaceInnerSource(compiler) {
        compiler.hooks.compilation.tap('InjectInnerWebpackPlugin', (compilation) => {
            compilation.hooks.processAssets.tap('InjectInnerWebpackPlugin', () => {
                this.compilationAssets = compilation.assets;
                const hooks = this.htmlWebpackPlugin.getHooks(compilation);

                hooks.afterTemplateExecution.tap('InjectInnerWebpackPlugin', (data) => {
                    const template = getRawTemplate(data.plugin.userOptions.template, compiler.context);

                    const assetList = this.assetListMap[template];
                    assetList && assetList.forEach((assetItem) => {
                        const {
                            chunk,
                            innerJsUrl,
                            rawScript,
                        } = assetItem;

                        const jsBundle = getBundleByChunk(compilation.chunks, chunk);

                        if (jsBundle) {
                            const content = compilation.assets[jsBundle].source();

                            data.html = this.getReplacedContent({
                                rawScript,
                                innerJsUrl,
                                content,
                                originContent: data.html,
                            });
                        }
                    });

                    const rawAssetList = this.rawAssetListMap[template];
                    rawAssetList && rawAssetList.forEach((rawAssetItem) => {
                        const {
                            scriptEntryPath,
                            innerJsUrl,
                            rawScript,
                        } = rawAssetItem;

                        const content = fs.readFileSync(scriptEntryPath, {
                            encoding: 'utf-8'
                        });

                        data.html = this.getReplacedContent({
                            rawScript,
                            innerJsUrl,
                            content,
                            originContent: data.html,
                        });
                    });
                });
            });
        });
    }
    clearInnerChunkOutput(compiler) {
        compiler.hooks.emit.tap('InjectInnerWebpackPlugin', (compilation) => {
            for (let template in this.assetListMap) {
                const assetList = this.assetListMap[template];

                assetList.forEach((assetItem) => {
                    const chunk = assetItem.chunk;

                    const jsBundle = getBundleByChunk(compilation.chunks, chunk);
                    delete this.compilationAssets[jsBundle];
                });
            }
        });
    }
    getScriptEntryPath(options = {}) {
        const {
            innerJsUrl,
            template,
            context,
        } = options;
    
        let scriptEntryPath = '';
        if (innerJsUrl[0] === '.') {
            // html relative path
            scriptEntryPath = path.resolve(template, '..', innerJsUrl);
        } else {
            // root relative path
            const finalContext = this.context || context;
            scriptEntryPath = path.resolve(finalContext, innerJsUrl);
        }
        return scriptEntryPath;
    }
    getReplacedContent(options = {}) {
        const {
            rawScript,
            innerJsUrl,
            content,
            originContent,
        } = options;

        let newContent = '';

        if (this.scriptTag) {
            newContent = originContent.replace(rawScript, this.scriptTag(content, innerJsUrl));
        } else {
            newContent = originContent.replace(rawScript, () => {
                return `<script>${content}</script>`;
            });
        }

        return newContent;
    }
}

module.exports = InjectInnerWebpackPlugin;

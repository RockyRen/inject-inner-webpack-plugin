const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const isObject = require('isobject');

const innerScriptPattern = /<script.*?src="(.*?)\?__inline".*?>.*?<\/script>/gmi

const getRawTemplate = (template) => {
    const result = template.match(/[^\!]*$/);

    return result && result[0] ? result[0] : '';
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
    const targetChunkList = chunks.filter((chunkData) => {
        return chunkData.name === chunkName;
    });

    if (!targetChunkList[0]) {
        return '';
    }

    return targetChunkList[0].files[0];
};

const getFullTemplatePath = (template, context) => {
    if (template.indexOf('!') === -1) {
        return path.resolve(context, template);
    }

    // If the template use a loader, then remove the loader
    const nonLoaderResult = template.match(/(?:[!])([^\\][^!?]+|[^\\!?])($|\?[^!?\n]+$)/);

    return nonLoaderResult && nonLoaderResult[1] ? nonLoaderResult[1] : '';
};

const getTemplateInPlugins = (plugins) => {
    let template = [];

    plugins && plugins.forEach((plugin) => {
        if (plugin.options && plugin.options.template) {
            template.push(plugin.options.template);
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

                    let scriptEntryPath = '';
                    if (innerJsUrl[0] === '.') {
                        // html relative path
                        scriptEntryPath = path.resolve(template, '..', innerJsUrl);
                    } else {
                        // root relative path
                        const finalContext = this.context || context;
                        scriptEntryPath = path.resolve(finalContext, innerJsUrl);
                    }

                    const isExistedScriptEntry = fs.existsSync(scriptEntryPath);
                    if (isExistedScriptEntry) {
                        const chunk = getAssetJsChunkName(template, index);

                        // set inner script to chunk
                        entry[chunk] = scriptEntryPath;

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
            };

            this.template.forEach(setSingleTemplateEntry);
        });
    }
    // get inner script chunk source, and replace html content
    replaceInnerSource(compiler) {
        compiler.hooks.compilation.tap('InjectInnerWebpackPlugin', (compilation) => {
            const hooks = this.htmlWebpackPlugin.getHooks(compilation);

            hooks.afterTemplateExecution.tap('InjectInnerWebpackPlugin', (data) => {
                const template = getRawTemplate(data.plugin.options.template);

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

                        if (this.scriptTag) {
                            data.html = data.html.replace(rawScript, this.scriptTag(content, innerJsUrl));
                        } else {
                            data.html = data.html.replace(rawScript, () => {
                                return `<script>${content}</script>`;
                            });
                        }
                    }

                });
            });
        });
    }
    clearInnerChunkOutput(compiler) {
        compiler.hooks.emit.tapAsync('InjectInnerWebpackPlugin', (compilation, callback) => {
            for (let template in this.assetListMap) {
                const assetList = this.assetListMap[template];

                assetList.forEach((assetItem) => {
                    const chunk = assetItem.chunk;

                    const jsBundle = getBundleByChunk(compilation.chunks, chunk);
                    delete compilation.assets[jsBundle];
                });
            }

            callback();
        });
    }
}

module.exports = InjectInnerWebpackPlugin;
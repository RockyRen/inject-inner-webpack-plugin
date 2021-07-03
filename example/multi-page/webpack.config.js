const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const InjectInnerWebpackPlugin = require('../../lib/index');

const entryList = [{
        key: 'home',
        js: 'home.js',
        html: 'home.html',
    },
    {
        key: 'about',
        js: 'about.js',
        html: 'about.html',
    },
];

const getHtmlPlugins = () => {
    return entryList.map((cur) => new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'src/pages', cur.key, 'index.html'),
        chunks: [cur.key],
        filename: `${cur.key}.html`,
    }));
};

const getEntry = () => {
    const entry = {};
    entryList.forEach((cur) => {
        entry[cur.key] = path.join(__dirname, 'src/pages', cur.key, 'index.js');
    });
    return entry;
};

module.exports = {
    mode: 'development',
    entry: getEntry(),
    output: {
        path: path.join(__dirname, 'dist'),
    },
    plugins: [
        ...getHtmlPlugins(),
        new InjectInnerWebpackPlugin(HtmlWebpackPlugin),
    ],
};

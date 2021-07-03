const HtmlWebpackPlugin = require('html-webpack-plugin');
const InjectInnerWebpackPlugin = require('../../lib/index');

module.exports = {
    mode: 'development',
    entry: {
        index: './index.js',
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
            chunks: ['index'],
        }),
        new InjectInnerWebpackPlugin(HtmlWebpackPlugin),
    ],
};

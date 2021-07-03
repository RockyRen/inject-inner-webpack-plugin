# inject-inner-webpack-plugin

**Webpack Plugin that injects inner script source to HTML files of the html-webpack-plugin output**

## Installation
```bash
npm install --save-dev inject-inner-webpack-plugin
```

## Example

**webpack.config.js**
```js
const HtmlWebpackPlugin = require('html-webpack-plugin');
const InjectInnerWebpackPlugin = require('inject-inner-webpack-plugin');
s
module.exports = {
    entry: {
        index: './index.js',
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
        }),
        new InjectInnerWebpackPlugin(HtmlWebpackPlugin),
    ],
};
```

**index.html**
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Webpack App</title>
    <!-- this script tag will be replaced by inner source in output html -->
    <script src="./inner.js?__inline"></script>
  </head>
  <body>
  </body>
</html>
```

This will generate a file `dist/index.html` containing the following
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Webpack App</title>
    <script>
        // inner.js bundle content
    </script>
  </head>
  <body>
      <script src="index.js"></script>
  </body>
</html>
```

`entry` in `webpack.config.js` shoule be Object.
Only handle the HtmlWebpackPlugin instances which has `template` option.

## Options
You must pass **HtmlWebpackPlugin** into first parameter, the second parameter is optional, for example:

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

new InjectInnerWebpackPlugin(HtmlWebpackPlugin, {
    context: path.resolve(__dirname, '..'),
});
```

Allowed values of the second parameter are as follows:

|Name|Type|Default|Description|
|:--:|:--:|:-----:|:----------|
|**`context`**|`{String}`|`Webpack Context`|If you use the relative path like `src/inner.js?__inline`, the path will relative to `context`|
|**`isRemainBundle`**|`{Boolean}`|`false`|If `true` then remain the inner chunks to output|
|**`scriptTag`**|`{Function}`|``|Custom inner content output|
|**`template`**|`{String|Array}`|``|Specify which template shoule be injected|



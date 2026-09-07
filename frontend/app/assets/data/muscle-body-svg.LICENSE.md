# muscle-body-svg.json の出典・ライセンス

このファイルのSVGパス座標・輪郭線データは、npmパッケージ
[`react-native-body-highlighter`](https://github.com/HichamELBSI/react-native-body-highlighter)
のソースコードから**座標データとスラッグ名のみ**を静的にコピーしたもの。
ライブラリ本体（npmパッケージ）はtorebuにインストールしていない
（発光表現・ゾーン塗り分け・ラベル配置は全て自前実装。経緯は`docs/muscle-highlight.md`参照）。

このパッケージはMITライセンス。該当ライセンス全文：

```
MIT License

Copyright (c) 2022 ELABBASSI Hicham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

含めているのは男性図（front/back）のみ。女性図・ダーク/ライトテーマ切替は
プロトタイプでは実装済みだが、torebu Phase2の確定スコープには含めていない
（`docs/muscle-highlight.md`参照）。

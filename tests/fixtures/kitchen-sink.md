# Kitchen Sink

All five marks: {++an insertion++}, {--a deletion--}, {~~the old~>the new~~}, {==a highlight==}, and a comment{>>@ke: standalone note<<}.

An anchored thread: {==this exact phrase==}{>>@ke: why this wording?<<}{>>@agent: it matches the spec terminology<<} continues here.

- list item with {++added words++}
- [ ] task with {--struck words--}

> blockquote with {~~old phrasing~>new phrasing~~} inside
> and a {>>note spanning
> two quoted lines<<} too

Inline markdown inside marks: {++has **bold** and `code` inside++}.

Decoys stay literal in code: `{++not a mark++}` and:

```js
const x = "{--also not a mark--}"
```

Escaped: \{++literal braces++}

CJK: 前言{++插入的文字++}后记，{>>@ke: 中文评论<<}。

Real ~~strikethrough~~ next to {~~a sub~>another sub~~} survives GFM.

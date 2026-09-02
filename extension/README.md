# WebMCP Assistant Extension POC

This sample verifies that one WXT and SolidJS codebase can provide a Chrome or
Edge side panel and a Firefox sidebar. It discovers and manually executes the
WebMCP tools exposed by the active page. The page remains responsible for its
authenticated session and backend calls; the extension does not read tokens.

## Run

```powershell
npm install
npm run dev
```

The development build is generated at `.output/chrome-mv3-dev`. Open
`chrome://extensions`, enable developer mode, choose **Load unpacked**, and
select that directory. Click the extension toolbar icon to open the panel.

Open a WebMCP-enabled page in the active tab and sign in normally. The panel
lists the tools registered by that page and builds an input form from each
tool's JSON schema. Complete the fields and click **Run tool**.

Use `npm run dev:edge` or `npm run dev:firefox` for the other browser targets.

Generated production builds are written under `.output/`.

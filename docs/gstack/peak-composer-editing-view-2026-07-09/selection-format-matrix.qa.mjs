import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const mainUrl = new URL("./index.html?mode=copilot&stage=brief", import.meta.url).href;
const captureScreenshots = process.env.CAPTURE_SCREENSHOTS === "1";
const browser = await chromium.launch({ headless: true });

const formats = [
  { id: "bold", wrapper: "strong", value: "" },
  { id: "italic", wrapper: "em", value: "" },
  { id: "underline", wrapper: "span.html-format", value: "" },
  { id: "strikeThrough", wrapper: "del", value: "" },
  { id: "foreColor", wrapper: "span.html-format", value: "#b42318" },
  { id: "hiliteColor", wrapper: "mark.html-format", value: "#fff1a8" },
];

const scenarios = ["cross-paragraph", "cross-block", "cross-item", "cross-cell"];

function screenshotPath(name) {
  return fileURLToPath(new URL(`./preview-selection-${name}.png`, import.meta.url));
}

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1614, height: 1324 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(8000);
  const errors = collectErrors(page);
  await page.goto(mainUrl);
  await page.waitForSelector('[data-intelligence-root][data-intelligence-mounted="true"]');
  return { page, errors };
}

async function selectScenario(page, scenario) {
  return page.evaluate((scenarioId) => {
    const textNodes = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      return nodes;
    };
    const edge = (root, side) => {
      const nodes = textNodes(root);
      return side === "start" ? nodes[0] : nodes.at(-1);
    };
    const block = (title) => document.querySelector(`#paper > [data-block-title="${title}"]`);
    let startRoot;
    let endRoot;

    if (scenarioId === "cross-paragraph") {
      startRoot = block("导语段落").querySelector(":scope > p");
      endRoot = block("Composer 定位段落").querySelector(":scope > p");
    }
    if (scenarioId === "cross-block") {
      startRoot = block("知识库结构段落").querySelector(":scope > p");
      endRoot = block("知识结构列表").querySelectorAll(":scope > ul > li")[1];
    }
    if (scenarioId === "cross-item") {
      const items = block("知识结构列表").querySelectorAll(":scope > ul > li");
      startRoot = items[0];
      endRoot = items[2];
    }
    if (scenarioId === "cross-cell") {
      const rows = block("PKM pipeline table").querySelectorAll(":scope tbody > tr");
      startRoot = rows[0].children[1];
      endRoot = rows[1].children[2];
    }
    if (!startRoot || !endRoot) throw new Error(`Unknown selection scenario: ${scenarioId}`);
    startRoot.scrollIntoView({ block: "center" });

    const start = edge(startRoot, "start");
    const end = edge(endRoot, "end");
    const startOffset = scenarioId === "cross-paragraph" || scenarioId === "cross-block"
      ? Math.max(0, start.data.length - Math.min(18, start.data.length))
      : 0;
    const endOffset = scenarioId === "cross-paragraph"
      ? Math.min(22, end.data.length)
      : end.data.length;
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    window.updateSelectionToolbar?.();

    const state = getSelectionState();
    state.units.forEach(({ unit }, index) => {
      unit.dataset.selectionMatrixUnit = `${scenarioId}-${index}`;
    });
    const table = block("PKM pipeline table").querySelector("table");
    return {
      blockCount: state.blocks.length,
      unitCount: state.units.length,
      scope: selectionScopeText(state),
      topBlockCount: document.querySelectorAll("#paper > .doc-block").length,
      table: {
        width: table.getBoundingClientRect().width,
        rowCount: table.rows.length,
        columnCounts: Array.from(table.rows).map((row) => row.cells.length),
        cellDisplays: Array.from(table.querySelectorAll("th,td")).map((cell) => getComputedStyle(cell).display),
      },
    };
  }, scenario);
}

async function applyFormat(page, format) {
  await page.waitForFunction(() => !document.querySelector("#selection-toolbar").hidden);
  await page.locator(`[data-selection-format="${format.id}"]`).click();
  if (!format.value) return;
  await page.locator(`[data-selection-color="${format.value}"]`).click();
}

async function assertStructure(page, scenario, format, before) {
  const result = await page.evaluate(({ scenarioId, wrapperSelector }) => {
    const wrappers = Array.from(document.querySelectorAll(`[data-selection-matrix-unit^="${scenarioId}-"] [data-selection-format-fragment="true"]`))
      .filter((wrapper) => wrapper.matches(wrapperSelector));
    const units = Array.from(document.querySelectorAll(`[data-selection-matrix-unit^="${scenarioId}-"]`));
    const table = document.querySelector('#paper > [data-block-title="PKM pipeline table"] table');
    return {
      wrapperCount: wrappers.length,
      unitCoverage: units.map((unit) => unit.querySelectorAll('[data-selection-format-fragment="true"]').length),
      structuralChildren: wrappers.filter((wrapper) => wrapper.querySelector("p,li,ul,ol,table,thead,tbody,tr,th,td,.doc-block")).length,
      topBlockCount: document.querySelectorAll("#paper > .doc-block").length,
      table: {
        width: table.getBoundingClientRect().width,
        rowCount: table.rows.length,
        columnCounts: Array.from(table.rows).map((row) => row.cells.length),
        cellDisplays: Array.from(table.querySelectorAll("th,td")).map((cell) => getComputedStyle(cell).display),
      },
    };
  }, { scenarioId: scenario, wrapperSelector: format.wrapper });

  assert.equal(result.wrapperCount, before.unitCount, `${scenario}/${format.id}: one wrapper is written inside every semantic unit`);
  assert.ok(result.unitCoverage.every((count) => count >= 1), `${scenario}/${format.id}: every selected unit owns its formatting fragment`);
  assert.equal(result.structuralChildren, 0, `${scenario}/${format.id}: formatting wrappers never contain Markdown structure nodes`);
  assert.equal(result.topBlockCount, before.topBlockCount, `${scenario}/${format.id}: top-level Block count is stable`);
  assert.equal(result.table.rowCount, before.table.rowCount, `${scenario}/${format.id}: table row count is stable`);
  assert.deepEqual(result.table.columnCounts, before.table.columnCounts, `${scenario}/${format.id}: table column structure is stable`);
  assert.ok(result.table.cellDisplays.every((display) => display === "table-cell"), `${scenario}/${format.id}: every table cell keeps table-cell layout`);
  assert.ok(Math.abs(result.table.width - before.table.width) < 1, `${scenario}/${format.id}: table width does not collapse or expand`);
}

async function captureRepresentative(page, scenario, format) {
  if (!captureScreenshots) return;
  await page.evaluate(() => {
    getSelection()?.removeAllRanges();
    document.querySelector("#selection-toolbar").hidden = true;
    document.querySelector("#selection-toolbar-popover").hidden = true;
    document.querySelector("#paper").classList.remove("has-text-selection");
  });
  await page.mouse.move(1588, 18);
  const target = scenario === "cross-cell"
    ? page.locator('#paper > [data-block-title="PKM pipeline table"]')
    : scenario === "cross-item"
      ? page.locator('#paper > [data-block-title="知识结构列表"]')
      : scenario === "cross-block"
        ? page.locator('#paper > [data-block-title="知识库结构段落"], #paper > [data-block-title="知识结构列表"]')
        : page.locator('#paper > [data-block-title="导语段落"], #paper > [data-block-title="Composer 定位段落"]');

  if (await target.count() === 1) {
    await target.screenshot({ path: screenshotPath(`${scenario}-${format.id}`) });
    return;
  }
  const boxes = (await Promise.all((await target.all()).map((locator) => locator.boundingBox()))).filter(Boolean);
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  await page.screenshot({ path: screenshotPath(`${scenario}-${format.id}`), clip: { x, y, width: right - x, height: bottom - y } });
}

const representative = new Map([
  ["cross-paragraph", "underline"],
  ["cross-block", "italic"],
  ["cross-item", "bold"],
  ["cross-cell", "foreColor"],
]);

try {
  for (const scenario of scenarios) {
    for (const format of formats) {
      const { page, errors } = await openPage();
      const before = await selectScenario(page, scenario);
      if (scenario === "cross-paragraph") assert.match(before.scope, /跨 2 个块/);
      if (scenario === "cross-block") assert.match(before.scope, /跨 3 个块/);
      if (scenario === "cross-item") assert.match(before.scope, /跨 3 个列表项/);
      if (scenario === "cross-cell") assert.match(before.scope, /跨 6 个单元格/);
      await applyFormat(page, format);
      await assertStructure(page, scenario, format, before);
      if (representative.get(scenario) === format.id) await captureRepresentative(page, scenario, format);
      assert.deepEqual(errors, [], `${scenario}/${format.id}: no runtime errors`);
      await page.close();
    }
  }

  const { page: linkPage, errors: linkErrors } = await openPage();
  const linkBefore = await selectScenario(linkPage, "cross-cell");
  await linkPage.locator('[data-selection-format="link"]').click();
  await linkPage.locator("[data-selection-link-input]").fill("https://example.com/cross-cell");
  await linkPage.locator("[data-selection-link-apply]").click();
  assert.equal(await linkPage.locator('[data-selection-format-fragment="true"]').count(), 0, "one hyperlink is refused across multiple table cells");
  assert.match(await linkPage.locator("#toast").textContent(), /一个链接只能落在一个段落、列表项或单元格内/);
  const linkAfter = await linkPage.evaluate(() => {
    const table = document.querySelector('#paper > [data-block-title="PKM pipeline table"] table');
    return { width: table.getBoundingClientRect().width, rows: table.rows.length, columns: Array.from(table.rows).map((row) => row.cells.length) };
  });
  assert.ok(Math.abs(linkAfter.width - linkBefore.table.width) < 1, "refused cross-cell link leaves table width unchanged");
  assert.equal(linkAfter.rows, linkBefore.table.rowCount, "refused cross-cell link leaves table rows unchanged");
  assert.deepEqual(linkAfter.columns, linkBefore.table.columnCounts, "refused cross-cell link leaves table columns unchanged");
  assert.deepEqual(linkErrors, [], "cross-cell link guard has no runtime errors");
  await linkPage.close();

  console.log(JSON.stringify({ status: "passed", scenarios: scenarios.length, formats: formats.length, formatCases: scenarios.length * formats.length, linkSafetyCases: 1, screenshots: captureScreenshots ? representative.size : 0 }, null, 2));
} finally {
  await browser.close();
}

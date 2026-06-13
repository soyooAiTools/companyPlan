import { createRequire } from "node:module";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scenarioPort = process.env.COMPANYPLAN_SCENARIO_PORT ?? process.env.PORT ?? "4274";
const baseUrl = process.env.COMPANY_PLAN_URL ?? `http://127.0.0.1:${scenarioPort}`;
const seedPassword = process.env.COMPANYPLAN_SEED_PASSWORD ?? "CompanyPlan@2026";
const forbiddenDemandToolbarText = ["字段管理", "筛选", "排序", "分组", "公告", "行高", "导出"];
const requiredDemandColumns = [
  "项目名称",
  "工作内容",
  "我的提单",
  "图片/附件/文件",
  "超链接",
  "开始日期",
  "优先级",
  "状态",
  "提单时长",
  "状态停留",
  "剩余时间",
  "负责人",
  "任务类别",
  "备注",
];
const accountScopes = {
  "u-producer": { name: "周牧", projects: ["p1", "p2", "p3", "p7"] },
  "u-ui": { name: "何苗", projects: ["p1", "p2", "p5", "p8"] },
  "u-dev": { name: "姜北", projects: ["p1", "p2", "p6", "p7"] },
};

let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) {
    throw new Error(message);
  }
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    "/root/CodePilot/node_modules/playwright",
    "/root/.openclaw/workspace/node_modules/playwright",
    "/root/adseed-testing/playwright/node_modules/playwright",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next local Playwright installation.
    }
  }

  throw new Error("Playwright is not available. Set PLAYWRIGHT_MODULE to an installed playwright package.");
}

async function isReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, child) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (await isReachable(url)) return;
    if (child.exitCode !== null) {
      throw new Error(`Production server exited before ${url} became reachable.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureServer() {
  if (process.env.COMPANY_PLAN_URL) {
    if (!(await isReachable(baseUrl))) {
      throw new Error(`External scenario target is not reachable: ${baseUrl}`);
    }
    return null;
  }

  if (await isReachable(baseUrl)) {
    throw new Error(
      `Refusing to run isolated scenario tests against an existing server at ${baseUrl}. ` +
        "Set COMPANY_PLAN_URL to target it explicitly, or set COMPANYPLAN_SCENARIO_PORT to a free port."
    );
  }

  const port = new URL(baseUrl).port || scenarioPort;
  const testDataDir = mkdtempSync(join(tmpdir(), "company-plan-prod-data-"));
  const child = spawn("npm", ["run", "start"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: port,
      COMPANYPLAN_DATA_DIR: testDataDir,
      COMPANYPLAN_SEED_PASSWORD: seedPassword,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(baseUrl, child);
  return child;
}

async function openDemandSheet(page) {
  const ticketNav = page.locator(".nav-button").filter({ hasText: "需求提单" }).first();
  if ((await ticketNav.count()) > 0) {
    await ticketNav.click();
  }
  await page.waitForSelector(".sheet-toolbar");
}

async function loginAs(page, username, expectedName) {
  if ((await page.locator(".logout-button").count()) > 0) {
    await page.locator(".logout-button").click();
  }
  await page.waitForSelector(".login-panel");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(seedPassword);
  await page.locator(".login-panel button").filter({ hasText: "登录" }).click();
  await page.waitForSelector(".app-shell");
  await openDemandSheet(page);
  const sessionText = await page.locator(".session-card").innerText();
  assert(sessionText.includes(expectedName), `Expected logged-in user ${expectedName}, got ${sessionText}`);
  assert((await page.locator(".scope-panel select").count()) === 0, "Production UI must not expose account switcher");
}

async function clickSheetTab(page, tabName) {
  await page.locator(".sheet-tabs button").filter({ hasText: tabName }).first().click();
  await page.waitForTimeout(80);
}

async function allTexts(locator) {
  return (await locator.allInnerTexts()).map((text) => text.trim()).filter(Boolean);
}

async function collectRows(page, selector) {
  await page.waitForSelector(selector);
  return page.locator(selector).evaluateAll((rows) =>
    rows.map((row) => ({
      ticketId: row.dataset.ticketId,
      projectId: row.dataset.projectId,
      requesterId: row.dataset.requesterId,
      ownerId: row.dataset.ownerId,
      status: row.dataset.status,
      offsetDays: row.dataset.offsetDays,
      startAt: row.dataset.startAt,
      text: row.textContent ?? "",
    }))
  );
}

function assertScopedRows(rows, accountId, label) {
  const scope = accountScopes[accountId];
  assert(Boolean(scope), `${label}: missing test scope for ${accountId}`);
  assert(rows.length > 0, `${label}: expected at least one visible row for ${scope.name}`);

  const leakedRows = rows.filter(
    (row) =>
      row.ownerId !== accountId &&
      row.requesterId !== accountId &&
      !scope.projects.includes(row.projectId ?? "")
  );
  assert(
    leakedRows.length === 0,
    `${label}: ${scope.name} saw out-of-scope rows: ${leakedRows.map((row) => row.ticketId).join(", ")}`
  );
}

async function assertDemandChrome(page) {
  const toolbarText = await page.locator(".sheet-toolbar").innerText();
  assert(toolbarText.includes("添加记录"), "Demand toolbar should include 添加记录");
  assert(toolbarText.includes("查找"), "Demand toolbar should include 查找");
  for (const text of forbiddenDemandToolbarText) {
    assert(!toolbarText.includes(text), `Demand toolbar should not include ${text}`);
  }

  const toolbarButtons = await allTexts(page.locator(".sheet-toolbar button"));
  assert(
    toolbarButtons.join("|") === "添加记录|查找",
    `Demand toolbar should only expose 添加记录 and 查找, got ${toolbarButtons.join(", ")}`
  );

  const headerText = await page.locator(".task-table-head").innerText();
  for (const column of requiredDemandColumns) {
    assert(headerText.includes(column), `Demand table is missing required column ${column}`);
  }

  const removedTopChrome = await page.locator("main.sheet-workspace .topbar, .sheet-doc-title, .sheet-share-button, .sheet-account-bar").count();
  assert(removedTopChrome === 0, "Demand workspace should not render document title/share/account top chrome");

  const bottomBar = await page.locator(".sheet-bottom-bar").boundingBox();
  const viewport = page.viewportSize();
  assert(Boolean(bottomBar && viewport), "Could not inspect bottom sheet tabs");
  assert(Math.abs(bottomBar.y + bottomBar.height - viewport.height) <= 2, "Bottom sheet tabs should stay pinned to the viewport bottom");

  const statusOptions = await page.locator(".status-select").first().locator("option").evaluateAll((options) =>
    options.map((option) => option.textContent?.trim())
  );
  assert(
    statusOptions.join("|") === "排队中|进行中|阻塞|已完成",
    `Status dropdown should use the four required states, got ${statusOptions.join(", ")}`
  );

  await page.locator(".sheet-toolbar button").filter({ hasText: "添加记录" }).click();
  await page.waitForSelector(".ticket-form");
  const priorityOptions = await ticketFormField(page, "优先级").locator("select option").evaluateAll((options) =>
    options.map((option) => option.textContent?.trim())
  );
  assert(
    priorityOptions.join("|") === "紧急|优先|普通|低优先",
    `Priority dropdown should use Chinese four-level labels, got ${priorityOptions.join(", ")}`
  );
  assert(await ticketFormField(page, "期望小时").locator("input").count() === 1, "Ticket form should use 期望小时");
  assert(await ticketFormField(page, "期望天数").count() === 0, "Ticket form should not show 期望天数");
  await page.locator(".ticket-form button").filter({ hasText: "取消" }).click();
  await page.waitForSelector(".ticket-form", { state: "detached" });
}

async function assertVisibleEnabledButtonsActionable(page, label) {
  const buttons = page.locator("button:visible");
  const count = await buttons.count();
  assert(count > 0, `${label}: expected visible buttons to test`);
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isEnabled())) continue;
    await button.click({ trial: true, timeout: 3000 });
  }
}

async function configureAdminDefaults(page) {
  const configuredProjectName = `管理员配置项目 ${Date.now()}`;
  await page.locator(".nav-button").filter({ hasText: "管理员" }).click();
  await page.waitForSelector(".admin-config-panel");
  await assertVisibleEnabledButtonsActionable(page, "admin config");

  await page.locator(".project-name-add input").fill(configuredProjectName);
  await page.locator(".project-name-add button").filter({ hasText: "添加" }).click();
  await page.waitForFunction((name) => {
    return Array.from(document.querySelectorAll(".project-name-editor input")).some((input) => input.value === name);
  }, configuredProjectName);

  const modelSetting = page.locator(".type-setting-editor > div").filter({ hasText: "模型" }).first();
  await modelSetting.locator("label").filter({ hasText: "默认交付小时" }).locator("input").fill("12");
  await modelSetting.locator("label").filter({ hasText: "风险阈值小时" }).locator("input").fill("4");

  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/admin/config") && response.request().method() === "PATCH"
  );
  await page.locator(".admin-config-panel button").filter({ hasText: "保存配置" }).click();
  const response = await responsePromise;
  assert(response.ok(), `Admin config save should succeed, got ${response.status()}`);

  await openDemandSheet(page);
  return configuredProjectName;
}

async function assertAdminWorkspaceButtons(page) {
  for (const label of ["运营总览", "项目池", "人员进度", "需求提单", "管理员"]) {
    await page.locator(".nav-button").filter({ hasText: label }).click();
    if (label === "需求提单") {
      await page.waitForSelector(".sheet-toolbar");
    } else if (label === "管理员") {
      await page.waitForSelector(".admin-config-panel");
    } else {
      await page.waitForSelector(".topbar");
    }
    await assertVisibleEnabledButtonsActionable(page, `admin ${label}`);
  }
  await openDemandSheet(page);
}

function ticketFormField(page, labelText) {
  return page.locator(".ticket-form label").filter({ hasText: labelText }).first();
}

async function createRealisticTicket(page, options = {}) {
  const {
    titlePrefix = "真实场景 UI 提研发联调",
    sourceProjectName = "Neon Chef 真实联调 - ui",
    discipline = "研发",
    ownerId = "u-dev",
    priority = "紧急",
    needType = "研发联调",
    expectRelationText = "我提给 姜北",
    expectedDueHours,
  } = options;
  const title = `${titlePrefix} ${Date.now()}`;
  const tempDir = mkdtempSync(join(tmpdir(), "company-plan-ticket-"));
  const imagePath = join(tempDir, "cta-note.png");
  const attachmentPath = join(tempDir, "interaction-brief.txt");
  const filePath = join(tempDir, "ui-assets.zip");

  writeFileSync(imagePath, Buffer.from("89504e470d0a1a0a", "hex"));
  writeFileSync(attachmentPath, "CTA placement and click-area notes.\n");
  writeFileSync(filePath, "mock zip payload\n");

  await page.locator(".sheet-toolbar button").filter({ hasText: "添加记录" }).click();
  await page.waitForSelector(".ticket-form");

  await ticketFormField(page, "需求标题").locator("input").fill(title);
  await ticketFormField(page, "所属项目").locator("select").selectOption("p1");
  await ticketFormField(page, "表格项目名称").locator("select").selectOption({ label: sourceProjectName });
  await ticketFormField(page, "环节").locator("select").selectOption(discipline);
  await ticketFormField(page, "负责人").locator("select").selectOption(ownerId);
  await ticketFormField(page, "优先级").locator("select").selectOption(priority);
  await ticketFormField(page, "任务类别").locator("input").fill(needType);
  if (expectedDueHours) {
    const dueValue = await ticketFormField(page, "期望小时").locator("input").inputValue();
    assert(Number(dueValue) === expectedDueHours, `Expected default due hours ${expectedDueHours}, got ${dueValue}`);
  }
  await ticketFormField(page, "说明").locator("textarea").fill(`UI 完成 CTA、失败页和引导标注后，提给${discipline}同事处理。`);
  await ticketFormField(page, "超链接").locator("input").fill("https://example.com/company-plan/spec");
  await ticketFormField(page, "备注").locator("input").fill("真实项目验收用例：UI 发起，程序负责。");

  await page.locator(".upload-tile").filter({ hasText: "添加图片" }).locator("input[type=file]").setInputFiles(imagePath);
  await page.locator(".upload-tile").filter({ hasText: "添加附件" }).locator("input[type=file]").setInputFiles(attachmentPath);
  await page.locator(".upload-tile").filter({ hasText: "添加文件" }).locator("input[type=file]").setInputFiles(filePath);

  await page.waitForFunction(() => {
    const text = document.querySelector(".attachment-list")?.textContent ?? "";
    return text.includes("图片") && text.includes("附件") && text.includes("文件");
  });
  const attachmentListText = await page.locator(".attachment-list").innerText();
  assert(attachmentListText.includes("图片"), "Ticket form should record uploaded image kind");
  assert(attachmentListText.includes("附件"), "Ticket form should record uploaded attachment kind");
  assert(attachmentListText.includes("文件"), "Ticket form should record uploaded file kind");

  await page.locator(".ticket-form button").filter({ hasText: "提交" }).click();
  await page.waitForSelector(".ticket-form", { state: "detached" });

  const createdRow = page.locator(".task-row").filter({ hasText: title }).first();
  await createdRow.waitFor();
  const relationText = await createdRow.locator(".relation-chip").innerText();
  assert(relationText.includes(expectRelationText), `Creator should see the new ticket as ${expectRelationText}`);
  assert((await createdRow.innerText()).includes(sourceProjectName), "Created ticket should use configured project name");
  if (expectedDueHours) {
    assert((await createdRow.innerText()).includes(`剩 ${expectedDueHours} 小时`), "Created ticket should use admin default delivery hours");
  }

  const attachmentSummary = await createdRow.locator(".attachment-summary").innerText();
  assert(attachmentSummary.includes("图1"), "Created ticket should summarize one image");
  assert(attachmentSummary.includes("附1"), "Created ticket should summarize one attachment");
  assert(attachmentSummary.includes("文1"), "Created ticket should summarize one file");
  assert((await createdRow.locator(".status-select").inputValue()) === "排队中", "Created ticket should start as 排队中");

  return title;
}

async function assertCreatedAttachmentOpenAndDownload(page, title) {
  const createdRow = page.locator(".task-row").filter({ hasText: title }).first();
  await createdRow.click();
  await page.waitForSelector(".ticket-detail-panel");
  await assertVisibleEnabledButtonsActionable(page, "ticket detail");

  const attachmentPanel = page.locator(".detail-attachment-list");
  const openLinks = attachmentPanel.locator("a").filter({ hasText: "打开" });
  const downloadLinks = attachmentPanel.locator("a").filter({ hasText: "下载" });
  assert((await openLinks.count()) >= 3, "Created attachments should expose open links");
  assert((await downloadLinks.count()) >= 3, "Created attachments should expose download links");

  const textAttachment = page.locator(".detail-attachment-list > span").filter({ hasText: "interaction-brief.txt" }).first();
  const openHref = await textAttachment.locator("a").filter({ hasText: "打开" }).getAttribute("href");
  const downloadHref = await textAttachment.locator("a").filter({ hasText: "下载" }).getAttribute("href");
  assert(Boolean(openHref), "Text attachment should expose an open URL");
  assert(Boolean(downloadHref), "Text attachment should expose a download URL");

  const openBody = await page.evaluate(async (href) => {
    const response = await fetch(href, { credentials: "include" });
    return { ok: response.ok, text: await response.text() };
  }, openHref);
  assert(openBody.ok, "Attachment open endpoint should return 200");
  assert(openBody.text.includes("CTA placement"), "Attachment open endpoint should return file content");

  const downloadPromise = page.waitForEvent("download");
  await textAttachment.locator("a").filter({ hasText: "下载" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert(Boolean(downloadPath), "Attachment download should produce a file");
}

async function assertHeaderHalfSelection(page) {
  await page.locator(".task-row input.row-checkbox").first().check();
  const isIndeterminate = await page.locator(".task-table-head input.row-checkbox").evaluate((checkbox) => checkbox.indeterminate);
  assert(isIndeterminate, "Header checkbox should become half-selected when only part of visible rows are selected");
}

async function dragGanttBar(page, row, deltaX, mode = "move") {
  const target = mode === "resize" ? row.locator(".gantt-resize-handle") : row.locator(".gantt-bar");
  const box = await target.boundingBox();
  assert(Boolean(box), `Could not locate gantt ${mode} target box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

async function run() {
  const server = await ensureServer();
  const { chromium } = loadPlaywright();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync("/usr/bin/chromium-browser") ? "/usr/bin/chromium-browser" : undefined);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector(".login-panel");
    const unauthBootstrapStatus = await page.evaluate(async () => {
      const response = await fetch("/api/bootstrap", { credentials: "include" });
      return response.status;
    });
    assert(unauthBootstrapStatus === 401, `Unauthenticated /api/bootstrap should return 401, got ${unauthBootstrapStatus}`);

    await loginAs(page, "admin", "林知远");
    await assertDemandChrome(page);
    await assertVisibleEnabledButtonsActionable(page, "admin demand");

    const adminNav = await allTexts(page.locator(".nav-button span"));
    for (const label of ["运营总览", "项目池", "人员进度", "需求提单", "管理员"]) {
      assert(adminNav.includes(label), `Admin navigation should include ${label}`);
    }
    const adminTabs = await allTexts(page.locator(".sheet-tabs button"));
    for (const label of ["需求提单", "延期任务预警", "任务甘特图", "+"]) {
      assert(adminTabs.includes(label), `Admin sheet tabs should include ${label}`);
    }
    const adminRowCount = await page.locator(".task-row").count();
    await assertAdminWorkspaceButtons(page);
    const configuredProjectName = await configureAdminDefaults(page);

    await loginAs(page, "ui", "何苗");
    await assertVisibleEnabledButtonsActionable(page, "ui demand");
    const uiNav = await allTexts(page.locator(".nav-button span"));
    assert(uiNav.join("|") === "需求提单", `Non-admin navigation should only include 需求提单, got ${uiNav.join(", ")}`);
    const uiTabs = await allTexts(page.locator(".sheet-tabs button"));
    assert(uiTabs.join("|") === "需求提单|延期任务预警", `UI user should not see gantt tab, got ${uiTabs.join(", ")}`);

    const uiRows = await collectRows(page, ".task-row");
    assertScopedRows(uiRows, "u-ui", "UI demand table");
    assert(adminRowCount > uiRows.length, "Admin demand table should show broader data than UI user");

    await clickSheetTab(page, "延期任务预警");
    assertScopedRows(await collectRows(page, ".warning-row"), "u-ui", "UI warning sheet");
    await clickSheetTab(page, "需求提单");

    await loginAs(page, "producer", "周牧");
    const producerNav = await allTexts(page.locator(".nav-button span"));
    assert(producerNav.join("|") === "需求提单", `Producer navigation should only include 需求提单, got ${producerNav.join(", ")}`);
    const producerTabs = await allTexts(page.locator(".sheet-tabs button"));
    assert(producerTabs.join("|") === "需求提单|延期任务预警", `Producer should not see gantt tab, got ${producerTabs.join(", ")}`);
    assertScopedRows(await collectRows(page, ".task-row"), "u-producer", "Producer demand table");
    await clickSheetTab(page, "延期任务预警");
    assertScopedRows(await collectRows(page, ".warning-row"), "u-producer", "Producer warning sheet");
    await clickSheetTab(page, "需求提单");

    await loginAs(page, "ui", "何苗");
    const modelConfigTitle = await createRealisticTicket(page, {
      titlePrefix: "后台默认模型交付小时",
      sourceProjectName: configuredProjectName,
      discipline: "模型",
      ownerId: "u-model",
      priority: "优先",
      needType: "模型",
      expectRelationText: "我提给 顾远",
      expectedDueHours: 12,
    });
    await assertCreatedAttachmentOpenAndDownload(page, modelConfigTitle);

    const createdTitle = await createRealisticTicket(page, {
      sourceProjectName: configuredProjectName,
    });
    await assertCreatedAttachmentOpenAndDownload(page, createdTitle);
    await page.reload({ waitUntil: "networkidle" });
    await openDemandSheet(page);
    await page.locator(".task-row").filter({ hasText: createdTitle }).first().waitFor();
    await assertHeaderHalfSelection(page);

    await loginAs(page, "dev", "姜北");
    const devTabs = await allTexts(page.locator(".sheet-tabs button"));
    assert(devTabs.includes("任务甘特图"), "Programmer should see gantt tab");
    assert(!devTabs.includes("+"), "Programmer should not see add-sheet control");
    assertScopedRows(await collectRows(page, ".task-row"), "u-dev", "Programmer demand table");

    const devCreatedRow = page.locator(".task-row").filter({ hasText: createdTitle }).first();
    await devCreatedRow.waitFor();
    assert((await devCreatedRow.locator(".relation-chip").innerText()).includes("指派给我"), "Programmer should see created ticket as 指派给我");

    await clickSheetTab(page, "延期任务预警");
    assertScopedRows(await collectRows(page, ".warning-row"), "u-dev", "Programmer warning sheet");

    await clickSheetTab(page, "任务甘特图");
    assertScopedRows(await collectRows(page, ".gantt-row"), "u-dev", "Programmer gantt sheet");
    const devGanttRow = page.locator(".gantt-row").filter({ hasText: createdTitle }).first();
    await devGanttRow.waitFor();
    const readonlyOffsetBefore = await devGanttRow.getAttribute("data-offset-hours");
    const readonlySpanBefore = await devGanttRow.getAttribute("data-span-hours");
    assert((await devGanttRow.locator(".gantt-bar").getAttribute("aria-disabled")) === "true", "Programmer gantt bar should be aria-disabled");
    assert(await devGanttRow.locator(".gantt-bar.readonly").count() === 1, "Programmer gantt bar should be readonly");
    await dragGanttBar(page, devGanttRow, 40);
    await page.waitForTimeout(150);
    assert((await devGanttRow.getAttribute("data-offset-hours")) === readonlyOffsetBefore, "Programmer drag should not move gantt bars");
    assert((await devGanttRow.getAttribute("data-span-hours")) === readonlySpanBefore, "Programmer drag should not resize gantt bars");

    await loginAs(page, "admin", "林知远");
    await clickSheetTab(page, "任务甘特图");
    const adminGanttRowsBefore = await page.locator(".gantt-row").evaluateAll((rows) => rows.map((row) => row.dataset.ticketId));
    const adminGanttRow = page.locator(".gantt-row").filter({ hasText: createdTitle }).first();
    await adminGanttRow.waitFor();
    const ticketId = await adminGanttRow.getAttribute("data-ticket-id");
    const beforeOffset = Number(await adminGanttRow.getAttribute("data-offset-hours"));
    const beforeSpan = Number(await adminGanttRow.getAttribute("data-span-hours"));
    const beforeStartAt = await adminGanttRow.getAttribute("data-start-at");

    await dragGanttBar(page, adminGanttRow, 40);
    await page.waitForFunction(
      ({ id, offset }) => {
        const row = document.querySelector(`.gantt-row[data-ticket-id="${id}"]`);
        return Number(row?.dataset.offsetHours) !== offset;
      },
      { id: ticketId, offset: beforeOffset }
    );

    const afterOffset = Number(await adminGanttRow.getAttribute("data-offset-hours"));
    const adminGanttRowsAfter = await page.locator(".gantt-row").evaluateAll((rows) => rows.map((row) => row.dataset.ticketId));
    assert(afterOffset === Math.min(240, beforeOffset + 10), "Admin drag should move only the visual timeline offset by ten hours");
    assert((await adminGanttRow.getAttribute("data-start-at")) === beforeStartAt, "Admin drag should not change start date");
    assert(adminGanttRowsBefore.join("|") === adminGanttRowsAfter.join("|"), "Admin drag should not change gantt row order");

    await dragGanttBar(page, adminGanttRow, 32, "resize");
    await page.waitForFunction(
      ({ id, span }) => {
        const row = document.querySelector(`.gantt-row[data-ticket-id="${id}"]`);
        return Number(row?.dataset.spanHours) !== span;
      },
      { id: ticketId, span: beforeSpan }
    );
    const afterSpan = Number(await adminGanttRow.getAttribute("data-span-hours"));
    assert(afterSpan >= beforeSpan + 8, "Admin resize should increase the visual timeline length");
    assert((await adminGanttRow.getAttribute("data-start-at")) === beforeStartAt, "Admin resize should not change start date");

    const auditEvents = await page.evaluate(async () => {
      const response = await fetch("/api/audit?limit=50", { credentials: "include" });
      return response.json();
    });
    const auditActions = auditEvents.events.map((event) => event.action);
    assert(auditActions.includes("ticket_created"), "Audit log should include ticket creation");
    assert(auditActions.includes("attachment_uploaded"), "Audit log should include attachment upload");
    assert(auditActions.includes("ticket_timeline_updated"), "Audit log should include admin gantt movement and resize");
    assert(auditActions.includes("admin_config_updated"), "Audit log should include admin configuration updates");

    await loginAs(page, "dev", "姜北");
    await clickSheetTab(page, "任务甘特图");
    const devGanttAfter = page.locator(`.gantt-row[data-ticket-id="${ticketId}"]`).first();
    await devGanttAfter.waitFor();
    assert(Number(await devGanttAfter.getAttribute("data-offset-hours")) === afterOffset, "Programmer scoped gantt should reflect admin timeline offset");
    assert(Number(await devGanttAfter.getAttribute("data-span-hours")) === afterSpan, "Programmer scoped gantt should reflect admin timeline length");

    console.log(`companyPlan scenarios passed (${assertions} assertions)`);
  } finally {
    await browser.close();
    if (server) {
      server.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

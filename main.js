const {
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
} = require("obsidian");

const DEFAULT_QUOTE_FILE = "研途星火语录.md";
const FALLBACK_QUOTE = "今天也向目标靠近一点。";

const DEFAULT_SETTINGS = {
  showOnStartup: true,
  showInStatusBar: true,
  showCountdown: true,
  examDate: "",
  goalName: "",
  lastShownDate: "",
};

class AddQuoteModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("kaoyan-motivation-add-modal");
    contentEl.createEl("h2", { text: "添加自定义语录" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "新语录会直接写入插件目录中的研途星火语录.md。",
    });

    const input = contentEl.createEl("input", {
      cls: "kaoyan-motivation-add-input",
      type: "text",
      placeholder: "写下一句鼓励自己的话",
    });
    const actions = contentEl.createDiv({ cls: "kaoyan-motivation-actions" });
    const addButton = actions.createEl("button", {
      cls: "mod-cta",
      text: "添加到语录库",
    });

    const submit = async () => {
      if (await this.plugin.addCustomQuote(input.value)) this.close();
    };
    addButton.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      void submit();
    });
    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MotivationModal extends Modal {
  constructor(app, plugin, quote) {
    super(app);
    this.plugin = plugin;
    this.quote = quote;
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("kaoyan-motivation-modal");

    const eyebrow = contentEl.createDiv({
      cls: "kaoyan-motivation-eyebrow",
      text: this.plugin.settings.goalName || "给今天的你",
    });
    eyebrow.setAttribute("aria-hidden", "true");

    contentEl.createEl("blockquote", {
      cls: "kaoyan-motivation-quote",
      text: this.quote,
    });

    const countdown = this.plugin.getCountdownText();
    if (countdown) {
      contentEl.createDiv({
        cls: "kaoyan-motivation-countdown",
        text: countdown,
      });
    }

    const actions = contentEl.createDiv({ cls: "kaoyan-motivation-actions" });
    this.createButton(actions, "换一句", "", () => {
      this.quote = this.plugin.pickQuote(this.quote);
      this.plugin.updateStatusBar(this.quote);
      this.render();
    });
    this.createButton(actions, "复制", "", async () => {
      await this.plugin.copyQuote(this.quote);
    });
    this.createButton(actions, "写入当前笔记", "mod-cta", () => {
      if (this.plugin.insertQuoteIntoActiveNote(this.quote)) this.close();
    });
  }

  createButton(parent, label, className, handler) {
    const button = parent.createEl("button", { text: label });
    if (className) button.addClass(className);
    button.addEventListener("click", handler);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class KaoyanMotivationSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "考考考研研研设置" });

    new Setting(containerEl)
      .setName("每天首次打开时显示")
      .setDesc("同一天内重复打开仓库不会反复弹出。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.showOnStartup = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("在状态栏显示")
      .setDesc("点击底部的激励语也可以打开完整卡片。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showInStatusBar)
          .onChange(async (value) => {
            this.plugin.settings.showInStatusBar = value;
            this.plugin.refreshStatusBarVisibility();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("显示考试倒计时")
      .setDesc("设置考试日期后，会在激励卡片与笔记摘录中显示剩余天数。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showCountdown)
          .onChange(async (value) => {
            this.plugin.settings.showCountdown = value;
            this.plugin.updateStatusBar();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("考试日期")
      .setDesc("留空即可隐藏倒计时，不预设未经确认的考试日期。")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.plugin.settings.examDate).onChange(async (value) => {
          this.plugin.settings.examDate = value;
          this.plugin.updateStatusBar();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("目标名称")
      .setDesc("例如“中南民大 085408”，会显示在激励卡片上。")
      .addText((text) =>
        text
          .setPlaceholder("给今天的你")
          .setValue(this.plugin.settings.goalName)
          .onChange(async (value) => {
            this.plugin.settings.goalName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("语录文件")
      .setDesc(`固定保存在插件目录：${this.plugin.getQuoteFilePath()}`)
      .addExtraButton((button) =>
        button
          .setIcon("refresh-cw")
          .setTooltip("重新读取语录")
          .onClick(async () => {
            await this.plugin.loadQuotesFromFile(true);
          }),
      );

    let quoteInput;
    new Setting(containerEl)
      .setName("添加自定义语录")
      .setDesc("输入一句话，直接追加到插件目录内的 Markdown 语录库。")
      .addText((text) => {
        quoteInput = text;
        text.setPlaceholder("写下一句鼓励自己的话");
      })
      .addButton((button) =>
        button.setButtonText("添加").setCta().onClick(async () => {
          if (await this.plugin.addCustomQuote(quoteInput.inputEl.value)) {
            quoteInput.setValue("");
          }
        }),
      );

    new Setting(containerEl)
      .setName("预览")
      .setDesc("立即查看一张激励卡片。")
      .addButton((button) =>
        button.setButtonText("激励一下").setCta().onClick(() => {
          this.plugin.showMotivation();
        }),
      );
  }
}

module.exports = class KaoyanMotivationPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.loadQuotesFromFile();

    this.currentQuote = this.pickQuote();
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("kaoyan-motivation-status");
    this.statusBarItem.setAttribute("aria-label", "打开考研激励卡片");
    this.registerDomEvent(this.statusBarItem, "click", () => this.showMotivation());
    this.refreshStatusBarVisibility();
    this.updateStatusBar(this.currentQuote);

    this.addRibbonIcon("sparkles", "考考考研研研：激励一下", () => {
      this.showMotivation();
    });

    this.addCommand({
      id: "show-motivation",
      name: "激励一下",
      callback: () => this.showMotivation(),
    });

    this.addCommand({
      id: "insert-motivation-into-note",
      name: "将激励语写入当前笔记",
      editorCallback: (editor) => {
        const quote = this.pickQuote();
        editor.replaceSelection(this.formatQuoteForNote(quote));
        this.updateStatusBar(quote);
      },
    });

    this.addCommand({
      id: "add-custom-motivation",
      name: "添加自定义语录",
      callback: () => new AddQuoteModal(this.app, this).open(),
    });

    this.addSettingTab(new KaoyanMotivationSettingTab(this.app, this));

    this.registerInterval(
      window.setInterval(() => void this.refreshQuotesIfChanged(), 3000),
    );

    this.app.workspace.onLayoutReady(() => {
      window.setTimeout(() => this.showDailyMotivationIfNeeded(), 800);
    });
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    const { customQuotes: legacyCustomQuotes = [], ...currentData } = data;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, currentData);
    this.legacyCustomQuotes = Array.isArray(legacyCustomQuotes)
      ? legacyCustomQuotes.filter(Boolean)
      : [];
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getAllQuotes() {
    return this.quotes?.length ? [...this.quotes] : [FALLBACK_QUOTE];
  }

  getQuoteFilePath() {
    return normalizePath(`${this.manifest.dir}/${DEFAULT_QUOTE_FILE}`);
  }

  parseQuotes(markdown) {
    return markdown
      .split(/\r?\n/)
      .map((line) => line.match(/^-\s+(.+?)\s*$/)?.[1] || "")
      .map((quote) => quote.trim())
      .filter(Boolean);
  }

  async loadQuotesFromFile(showNotice = false) {
    const path = this.getQuoteFilePath();
    try {
      const markdown = await this.app.vault.adapter.read(path);
      const quotes = this.parseQuotes(markdown);
      this.quotes = [...new Set([...quotes, ...this.legacyCustomQuotes])];
      if (this.quotes.length === 0) this.quotes = [FALLBACK_QUOTE];
      this.quoteFileMtime = (await this.app.vault.adapter.stat(path))?.mtime || 0;

      if (showNotice) {
        new Notice(`已读取 ${this.quotes.length} 条语录。`, 2500);
        this.updateStatusBar(this.pickQuote(this.currentQuote));
      }
    } catch (error) {
      this.quotes = [FALLBACK_QUOTE];
      if (showNotice) new Notice(`未找到语录文件：${path}`, 4000);
      console.error("考考考研研研：读取语录文件失败", error);
    }
  }

  async refreshQuotesIfChanged() {
    try {
      const stat = await this.app.vault.adapter.stat(this.getQuoteFilePath());
      if (!stat || stat.mtime === this.quoteFileMtime) return;
      await this.loadQuotesFromFile();
      this.updateStatusBar(this.pickQuote(this.currentQuote));
    } catch (error) {
      console.error("考考考研研研：检查语录文件失败", error);
    }
  }

  async addCustomQuote(value) {
    const quote = value.replace(/\s+/g, " ").trim();
    if (!quote) {
      new Notice("请先输入一条语录。", 2500);
      return false;
    }

    const path = this.getQuoteFilePath();
    try {
      const markdown = await this.app.vault.adapter.read(path);
      if (this.parseQuotes(markdown).includes(quote)) {
        new Notice("这条语录已经存在。", 2500);
        return false;
      }

      const separator = markdown.endsWith("\n") ? "" : "\n";
      await this.app.vault.adapter.write(path, `${markdown}${separator}- ${quote}\n`);
      await this.loadQuotesFromFile();
      this.updateStatusBar(quote);
      new Notice(`已添加到语录库，当前共 ${this.quotes.length} 条。`, 3000);
      return true;
    } catch (error) {
      console.error("考考考研研研：添加语录失败", error);
      new Notice("添加失败，请检查语录文件。", 3500);
      return false;
    }
  }

  pickQuote(previous = "") {
    const quotes = this.getAllQuotes();
    if (quotes.length === 0) return FALLBACK_QUOTE;
    if (quotes.length === 1) return quotes[0];

    let next = quotes[Math.floor(Math.random() * quotes.length)];
    while (next === previous) {
      next = quotes[Math.floor(Math.random() * quotes.length)];
    }
    this.currentQuote = next;
    return next;
  }

  showMotivation() {
    const quote = this.pickQuote(this.currentQuote);
    this.updateStatusBar(quote);
    new MotivationModal(this.app, this, quote).open();
  }

  async showDailyMotivationIfNeeded() {
    if (!this.settings.showOnStartup) return;
    const today = this.getLocalDateKey();
    if (this.settings.lastShownDate === today) return;

    this.settings.lastShownDate = today;
    await this.saveSettings();
    this.showMotivation();
  }

  getLocalDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  getCountdownText() {
    if (!this.settings.showCountdown || !this.settings.examDate) return "";
    const examDate = new Date(`${this.settings.examDate}T00:00:00`);
    if (Number.isNaN(examDate.getTime())) return "";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.ceil((examDate.getTime() - today.getTime()) / 86400000);
    if (days > 0) return `距离考试还有 ${days} 天`;
    if (days === 0) return "今天上考场，稳住，你准备好了。";
    return `考试日期已过去 ${Math.abs(days)} 天`;
  }

  formatQuoteForNote(quote) {
    const countdown = this.getCountdownText();
    const lines = ["> [!success] 考考考研研研", `> ${quote}`];
    if (countdown) lines.push(`>`, `> ${countdown}`);
    return `${lines.join("\n")}\n`;
  }

  insertQuoteIntoActiveNote(quote) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("请先打开一篇 Markdown 笔记。", 3000);
      return false;
    }

    view.editor.replaceSelection(this.formatQuoteForNote(quote));
    this.updateStatusBar(quote);
    new Notice("激励语已写入当前笔记。", 2000);
    return true;
  }

  async copyQuote(quote) {
    const text = [quote, this.getCountdownText()].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      new Notice("激励语已复制。", 2000);
    } catch (error) {
      console.error("考考考研研研：复制失败", error);
      new Notice("复制失败，请稍后重试。", 3000);
    }
  }

  refreshStatusBarVisibility() {
    this.statusBarItem.toggleClass(
      "kaoyan-motivation-hidden",
      !this.settings.showInStatusBar,
    );
  }

  updateStatusBar(quote = this.currentQuote) {
    this.currentQuote = quote || this.pickQuote();
    const countdown = this.getCountdownText();
    this.statusBarItem.setText(
      countdown ? `✨ ${countdown} · ${this.currentQuote}` : `✨ ${this.currentQuote}`,
    );
    this.statusBarItem.setAttribute(
      "title",
      `${this.currentQuote}${countdown ? `\n${countdown}` : ""}`,
    );
  }
};

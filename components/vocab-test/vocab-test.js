// 忆闪 - 增强词汇量测试（25题分层抽样）
const TEST_BANK = [
  { level: 1, term: "the" }, { level: 1, term: "good" }, { level: 1, term: "make" }, { level: 1, term: "people" }, { level: 1, term: "time" },
  { level: 2, term: "establish" }, { level: 2, term: "obvious" }, { level: 2, term: "suggest" }, { level: 2, term: "require" }, { level: 2, term: "approach" },
  { level: 2, term: "opportunity" }, { level: 2, term: "significant" }, { level: 2, term: "experience" }, { level: 2, term: "particular" }, { level: 2, term: "available" },
  { level: 3, term: "encompass" }, { level: 3, term: "precipitate" }, { level: 3, term: "ephemeral" }, { level: 3, term: "ubiquitous" }, { level: 3, term: "ameliorate" },
  { level: 3, term: "paradigm" }, { level: 3, term: "juxtapose" }, { level: 3, term: "conundrum" }, { level: 3, term: "surreptitious" }, { level: 3, term: "concomitant" },
  { level: 4, term: "obfuscate" }, { level: 4, term: "perspicacious" }, { level: 4, term: "magnanimous" }, { level: 4, term: "chimera" }, { level: 4, term: "insouciance" },
  { level: 4, term: "halcyon" }, { level: 4, term: "susurration" }, { level: 4, term: "defenestrate" }, { level: 4, term: "pulchritudinous" }, { level: 4, term: "antediluvian" },
  { level: 5, term: "callipygian" }, { level: 5, term: "otiose" }, { level: 5, term: "diaskeuasis" }, { level: 5, term: "phrontistery" }, { level: 5, term: "xenodochial" },
  { level: 5, term: "procatalepsis" }, { level: 5, term: "sphallolalia" }, { level: 5, term: "chrysoprase" }, { level: 5, term: "epistrophe" }, { level: 5, term: "erechtheum" }
];

const TOTAL_QUESTIONS = 25;
const LEVEL_WEIGHTS = [2000, 2000, 2000, 2000, 4000]; // 各级对应词库大小

Component({
  properties: {},
  data: {
    stage: 'intro', // intro | test | result
    testWords: [],
    currentIndex: 0,
    answers: {},
    result: 0,
    levelStats: {}
  },

  lifetimes: {
    attached() {
      this.generateTest();
    }
  },

  methods: {
    generateTest() {
      // 按等级分组，每组随机抽取5个
      const grouped = {};
      for (const w of TEST_BANK) {
        if (!grouped[w.level]) grouped[w.level] = [];
        grouped[w.level].push(w);
      }
      let test = [];
      for (let lv = 1; lv <= 5; lv++) {
        const pool = grouped[lv] || [];
        // ★ Fisher-Yates 洗牌
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        test = test.concat(pool.slice(0, 5));
      }
      // ★ Fisher-Yates 打乱最终顺序
      for (let i = test.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [test[i], test[j]] = [test[j], test[i]];
      }
      this.setData({ testWords: test, answers: {}, currentIndex: 0 });
    },

    onAnswer(e) {
      const known = e.currentTarget.dataset.value;
      const idx = this.data.currentIndex;
      this.data.answers[idx] = known;

      if (idx < this.data.testWords.length - 1) {
        this.setData({ currentIndex: idx + 1 });
      } else {
        this.computeResult();
      }
    },

    computeResult() {
      const levelStats = {};
      const levelCounts = {};
      const levelKnown = {};

      for (let i = 0; i < this.data.testWords.length; i++) {
        const lv = this.data.testWords[i].level;
        levelCounts[lv] = (levelCounts[lv] || 0) + 1;
        if (this.data.answers[i]) levelKnown[lv] = (levelKnown[lv] || 0) + 1;
      }

      let estimate = 0;
      for (let lv = 1; lv <= 5; lv++) {
        const total = levelCounts[lv] || 0;
        const known = levelKnown[lv] || 0;
        const rate = total > 0 ? known / total : 0;
        estimate += LEVEL_WEIGHTS[lv - 1] * rate;
        levelStats[lv] = { total, known, rate: Math.round(rate * 100) };
      }

      this.setData({
        stage: 'result',
        result: Math.round(estimate),
        levelStats
      });
    },

    onFinish() {
      this.triggerEvent('finish', { result: this.data.result, levelStats: this.data.levelStats });
    },

    onRetry() {
      this.setData({ stage: 'intro', answers: {}, currentIndex: 0, result: 0 });
      this.generateTest();
    },

    onDismiss() {
      this.triggerEvent('close');
    }
  }
});
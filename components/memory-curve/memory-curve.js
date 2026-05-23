// 忆闪 - 增强记忆曲线组件（Canvas 2D 自绘）
const { predictRecallProbability } = require('../../utils/algorithm');

Component({
  properties: {
    words: {
      type: Array,
      value: [],
      observer: 'draw'
    },
    width: {
      type: Number,
      value: 630
    },
    height: {
      type: Number,
      value: 400
    }
  },

  lifetimes: {
    attached() {
      this._ready = true;
      if (this.properties.words.length) this.draw();
    }
  },

  methods: {
    draw() {
      if (!this._ready) return;
      const words = this.properties.words;
      if (!words || words.length < 5) return;

      const query = this.createSelectorQuery();
      query.select('#curveCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = 2;
          const w = this.properties.width;
          const h = this.properties.height;
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.scale(dpr, dpr);

          // 计算数据
          const now = Date.now();
          const intervals = [0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90];
          const points = intervals.map(d => {
            const future = now + d * 86400000;
            let sum = 0;
            for (const w of words) sum += predictRecallProbability(w, future);
            return { day: d, retention: Math.round((sum / words.length) * 100) };
          });

          this.drawCurve(ctx, points, w, h);
        });
    },

    drawCurve(ctx, points, w, h) {
      const pad = { top: 64, right: 32, bottom: 56, left: 64 };
      const pw = w - pad.left - pad.right;
      const ph = h - pad.top - pad.bottom;

      // 背景
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      this.roundRect(ctx, 0, 0, w, h, 20);
      ctx.fill();

      // 标题
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('留存率预测模型', pad.left, 28);
      ctx.fillStyle = '#4f46e5';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('AGGREGATE FORGETTING CURVE', pad.left, 46);

      // 30天预测值
      const lastPoint = points[points.length - 1];
      ctx.fillStyle = '#4f46e5';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(lastPoint.retention + '%', w - pad.right, 38);
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('30天后预测', w - pad.right, 52);
      ctx.textAlign = 'start';

      // 计算Y轴范围
      const maxR = Math.max(...points.map(p => p.retention), 10);
      const minR = Math.min(...points.map(p => p.retention), maxR - 10);

      // 网格线
      for (let v = 0; v <= 100; v += 25) {
        const y = pad.top + ph - ((v - minR) / (maxR - minR)) * ph;
        if (y < pad.top || y > h - pad.bottom) continue;
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(v + '%', pad.left - 8, y + 3);
      }
      ctx.textAlign = 'start';

      // 曲线 - 渐变色带
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
      grad.addColorStop(0, 'rgba(79, 70, 229, 0.15)');
      grad.addColorStop(1, 'rgba(79, 70, 229, 0.02)');

      ctx.beginPath();
      const firstX = pad.left;
      const firstY = pad.top + ph - ((points[0].retention - minR) / (maxR - minR)) * ph;
      ctx.moveTo(firstX, firstY);

      // 贝塞尔曲线
      for (let i = 0; i < points.length - 1; i++) {
        const x1 = pad.left + (points[i].day / 90) * pw;
        const y1 = pad.top + ph - ((points[i].retention - minR) / (maxR - minR)) * ph;
        const x2 = pad.left + (points[i + 1].day / 90) * pw;
        const y2 = pad.top + ph - ((points[i + 1].retention - minR) / (maxR - minR)) * ph;
        const cpX = (x1 + x2) / 2;
        ctx.bezierCurveTo(cpX, y1, cpX, y2, x2, y2);
      }

      // 填充区域
      const lastX = pad.left + pw;
      ctx.lineTo(lastX, pad.top + ph);
      ctx.lineTo(pad.left, pad.top + ph);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 曲线描边
      ctx.beginPath();
      ctx.moveTo(firstX, firstY);
      for (let i = 0; i < points.length - 1; i++) {
        const x1 = pad.left + (points[i].day / 90) * pw;
        const y1 = pad.top + ph - ((points[i].retention - minR) / (maxR - minR)) * ph;
        const x2 = pad.left + (points[i + 1].day / 90) * pw;
        const y2 = pad.top + ph - ((points[i + 1].retention - minR) / (maxR - minR)) * ph;
        const cpX = (x1 + x2) / 2;
        ctx.bezierCurveTo(cpX, y1, cpX, y2, x2, y2);
      }
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 数据点
      for (const p of points) {
        const x = pad.left + (p.day / 90) * pw;
        const y = pad.top + ph - ((p.retention - minR) / (maxR - minR)) * ph;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // X轴标签
      const xLabels = [0, 7, 14, 21, 30, 45, 60, 90];
      for (const d of xLabels) {
        const x = pad.left + (d / 90) * pw;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const label = d === 0 ? '今日' : d + '天';
        ctx.fillText(label, x, h - pad.bottom + 20);
      }
    },

    roundRect(ctx, x, y, w, h, r) {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
  }
});
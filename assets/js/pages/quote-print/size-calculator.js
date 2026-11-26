export function getDigitalPrintSizeMultiplier(size, cw, ch, cfg = {}) {
      const A4_AREA = 210*297;
      const preset = cfg?.multipliers || {};
      const minMul = Number(cfg?.minMultiplier ?? 0.6);

      // max size 제한: 13×19in (482×330mm) 이내 (회전 허용)
      const MAX_W = 482;
      const MAX_H = 330;

      // Inch presets -> treat as custom with fixed dims
      if (size === 'IN12x18') { cw = 457; ch = 305; size = 'CUSTOM'; }
      if (size === 'IN13x19') { cw = 482; ch = 330; size = 'CUSTOM'; }

      const configuredA4 = Math.max(Number(preset?.A4 ?? 1) || 1, minMul);
      const configuredA3 = Math.max(Number(preset?.A3 ?? 2) || 2, minMul);

      // 디지털 출력 판형 기준: B5는 A4 단가, B4는 A3 단가로 계산합니다.
      if (size === 'B5') return configuredA4;
      if (size === 'B4' || size === 'A3') return configuredA3;

      // 직접입력은 실제 가로×세로를 판형에 맞춰 자동 계산합니다.
      // A4 이하는 A4 단가, 그보다 큰 허용 판형은 모두 A3 단가.
      if (size === 'CUSTOM') {
        const w = Number(cw) || 0;
        const h = Number(ch) || 0;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;

        const ok = (w <= MAX_W && h <= MAX_H) || (w <= MAX_H && h <= MAX_W);
        if (!ok) {
          throw new Error('디지털 인쇄 최대 사이즈는 13×19인치(482×330mm) 이하입니다.');
        }

        const shortSide = Math.min(w, h);
        const longSide = Math.max(w, h);
        if (shortSide <= 210 && longSide <= 297) return configuredA4;
        return configuredA3;
      }

      // Preset override (admin-configurable)
      if (preset && preset[size] != null) {
        const v = Number(preset[size]) || 0;
        return Math.max(v, minMul);
      }

      // Fallback: area ratio for known presets
      const map = {
        A4: 210*297,
        A3: 297*420,
        A5: 148*210,
        B5: 182*257,
        B4: 257*364
      };
      const area = map[size] || A4_AREA;
      const mul = area / A4_AREA;
      return Math.max(mul, minMul);
    }

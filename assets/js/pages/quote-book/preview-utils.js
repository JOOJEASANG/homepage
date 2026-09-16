// 이미지 미리보기의 순수 데이터 유틸

export function getPreviewUrl(val) {
        if (!val) return '';
        if (typeof val === 'string') return val;

        if (typeof val === 'object') {
            // Most common shapes used across admin versions
            const candidates = [
                val.url,
                val.downloadURL,
                val.downloadUrl,
                val.src,
                val.imageUrl,
                val.previewUrl
            ].filter(Boolean);
            if (candidates.length) return candidates[0];

            // Some admin UIs store nested objects
            if (val.meta && typeof val.meta === 'object') {
                const nested = [val.meta.url, val.meta.downloadURL, val.meta.downloadUrl].filter(Boolean);
                if (nested.length) return nested[0];
            }
        }
        return '';
    }

export function inferInnerGroup(key) {
        // 기본 휴리스틱 (meta에 group 없을 때)
        const premiumKeys = new Set(['snow120','snow150','snow200','snow250','arte190']);
        return premiumKeys.has(key) ? 'premium' : 'general';
    }

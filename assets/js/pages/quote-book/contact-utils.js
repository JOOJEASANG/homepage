// 연락처 정규화/표시와 SHA-256 헬퍼
// 기존 비회원 식별/조회 동작을 그대로 유지합니다.

export function sha256HexSync(str) {
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        let result = '';
        const words = [];
        const asciiBitLength = str.length * 8;
        let hash = sha256HexSync.h || [];
        let k = sha256HexSync.k || [];
        let primeCounter = k.length;
        if (!primeCounter) {
            const isPrime = n => { for (let i = 2; i*i <= n; i++) if (n % i === 0) return false; return true; };
            const frac = x => (x - Math.floor(x));
            let n = 2;
            while (primeCounter < 64) {
                if (isPrime(n)) {
                    if (primeCounter < 8) hash[primeCounter] = (frac(mathPow(n, 1/2)) * maxWord) | 0;
                    k[primeCounter] = (frac(mathPow(n, 1/3)) * maxWord) | 0;
                    primeCounter++;
                }
                n++;
            }
            sha256HexSync.h = hash; sha256HexSync.k = k;
        }
        str = unescape(encodeURIComponent(str));
        for (let i = 0; i < str.length; i++) words[i >> 2] |= str.charCodeAt(i) << ((3 - i) % 4) * 8;
        words[asciiBitLength >> 5] |= 0x80 << (24 - asciiBitLength % 32);
        words[((asciiBitLength + 64 >> 9) << 4) + 15] = asciiBitLength;
        for (let j = 0; j < words.length; ) {
            const w = words.slice(j, j += 16);
            const oldHash = hash.slice(0);
            for (let i = 0; i < 64; i++) {
                const w15 = w[i - 15], w2 = w[i - 2];
                const a = hash[0], e = hash[4];
                const temp1 = (hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0)) | 0;
                const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
                hash = [(temp1 + temp2) | 0].concat(hash); hash[4] = (hash[4] + temp1) | 0; hash.pop();
            }
            for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 3; j + 1; j--) {
                const b = (hash[i] >> (j * 8)) & 255;
                result += (b < 16 ? '0' : '') + b.toString(16);
            }
        }
        return result;
    }

export const normalizeContactDigits = (v) => (v || '').toString().replace(/[^0-9]/g, '');
export const formatPhoneHyphen = (v) => {
        const d = normalizeContactDigits(v);
        if (!d) return '';
        if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
        if (d.length === 10) {
            if (d.startsWith('02')) return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6)}`;
            return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
        }
        if (d.length === 9 && d.startsWith('02')) return `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}`;
        return v.toString();
    };

export function pickContactFromUserData(userData){
            if(!userData) return '';
            const cands = [];
            const push = (v)=>{ if(v!==undefined && v!==null && String(v).trim()!=='') cands.push(v); };
            if (typeof userData.contact === 'string' || typeof userData.contact === 'number') push(userData.contact);
            if (userData.contact && typeof userData.contact === 'object') {
                push(userData.contact.phone); push(userData.contact.tel); push(userData.contact.mobile); push(userData.contact.value);
            }
            push(userData.phone); push(userData.phoneNumber); push(userData.phone_number);
            push(userData.mobile); push(userData.cell); push(userData.tel); push(userData.telephone);
            if (userData.profile && typeof userData.profile === 'object') {
                push(userData.profile.phone); push(userData.profile.tel); push(userData.profile.mobile);
            }
            for (const v of cands) {
                const d = normalizeContactDigits(v);
                if (d) return d;
            }
            return '';
        }

export async function sha256Hex(text) {
        try {
            if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
                const enc = new TextEncoder();
                const data = enc.encode(text);
                const digest = await window.crypto.subtle.digest('SHA-256', data);
                return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) {
            console.warn('crypto.subtle SHA-256 실패, 폴백 사용:', e);
        }
        return sha256HexSync(text);
    }

export function formatContact(contact) { return contact.replace(/[^0-9]/g, '').replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`); };

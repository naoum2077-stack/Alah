// --- Matrix Background Effect ---
const canvasMatrix = document.getElementById('matrix-canvas');
const ctxM = canvasMatrix.getContext('2d');
canvasMatrix.width = window.innerWidth;
canvasMatrix.height = window.innerHeight;

const letters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$+-*/=%""\'#&_(),.;:?!\\|{}<>[]^~';
const fontSize = 14;
const columns = canvasMatrix.width / fontSize;
const drops = Array(Math.floor(columns)).fill(1);

function drawMatrix() {
    ctxM.fillStyle = 'rgba(3, 8, 3, 0.08)'; // Fade out effect
    ctxM.fillRect(0, 0, canvasMatrix.width, canvasMatrix.height);
    ctxM.fillStyle = '#00ff00';
    ctxM.font = fontSize + 'px "Share Tech Mono", monospace';
    
    for (let i = 0; i < drops.length; i++) {
        const text = letters.charAt(Math.floor(Math.random() * letters.length));
        ctxM.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvasMatrix.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i]++;
    }
}
setInterval(drawMatrix, 50);
window.addEventListener('resize', () => {
    canvasMatrix.width = window.innerWidth;
    canvasMatrix.height = window.innerHeight;
});

// --- DOM Elements ---
const el = (id) => document.getElementById(id);
const drop = el('drop');
const fileInput = el('file');
const previewWrap = el('previewWrap');
const preview = el('preview');
const overlay = el('overlay');
const scanLine = el('scanLine');
const removeBtn = el('removeBtn');
const warn = el('warn');
const warnMsg = el('warnMsg');
const result = el('result');

const barFill = el('barFill');
const bigIcon = el('bigIcon');
const sigText = el('sigText');
const confText = el('confText');
const reasonBox = el('reasonBox');
const srBox = el('srBox');
const sdBox = el('sdBox');
const volBox = el('volBox');
const analysisText = el('analysisText');
const secLeft = el('secLeft');
const roiTag = el('roiTag');

const canvas = el('cv');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const tmpCanvas = el('tmp');
const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

let countdownTimer = null;

// ---------- Utils ----------
function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function resetAll() {
    clearInterval(countdownTimer);
    countdownTimer = null;
    warn.style.display = 'none';
    result.style.display = 'none';
    overlay.style.display = 'none';
    scanLine.style.display = 'none';
    roiTag.style.display = 'none';
    preview.src = '';
    previewWrap.style.display = 'none';
    fileInput.value = '';
}

function showWarn(message) {
    warnMsg.textContent = message || "[ ERROR ] تعذر تحليل الصورة.";
    warn.style.display = 'block';
    startAutoClear(true);
}

function startAutoClear(isWarn = false) {
    clearInterval(countdownTimer);
    let t = 11;
    if (!isWarn) secLeft.textContent = String(t);
    countdownTimer = setInterval(() => {
        t--;
        if (!isWarn) secLeft.textContent = String(Math.max(t, 0));
        if (t <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            resetAll();
        }
    }, 1000);
}

// ---------- Drag & Drop ----------
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('drag');
});
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
});
fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) handleFile(f);
});
removeBtn.addEventListener('click', resetAll);

// ---------- Color Model ----------
function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
}

function isGreenCandle(r, g, b) {
    const { h, s, v } = rgbToHsv(r, g, b);
    return (h > 70 && h < 170 && s > 0.20 && v > 0.12);
}

function isRedCandle(r, g, b) {
    const { h, s, v } = rgbToHsv(r, g, b);
    const isRedHue = (h < 25 || h > 330);
    return (isRedHue && s > 0.20 && v > 0.12);
}

function isCandlePixel(r, g, b) {
    return isGreenCandle(r, g, b) || isRedCandle(r, g, b);
}

// ---------- Image IO ----------
function getImageDataFromImg(img) {
    const maxW = 1100;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxW) {
        const r = maxW / w;
        w = Math.round(w * r);
        h = Math.round(h * r);
    }
    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
}

function imageDataToDataURL(imageData) {
    tmpCanvas.width = imageData.width; tmpCanvas.height = imageData.height;
    tmpCtx.putImageData(imageData, 0, 0);
    return tmpCanvas.toDataURL("image/png");
}

function findMainAndVolumeRegions(w, h) {
    const volTop = Math.floor(h * 0.74);
    const mainTop = 0;
    const mainBottom = volTop - 1;
    const volBottom = h - 1;
    return { mainTop, mainBottom, volTop, volBottom };
}

function cropToChartAndVolume(imageData) {
    const { data, width: w, height: h } = imageData;
    const regions = findMainAndVolumeRegions(w, h);

    let minX = w, minY = h, maxX = 0, maxY = 0, candleHits = 0;
    const y0 = regions.mainTop + Math.floor((regions.mainBottom - regions.mainTop) * 0.03);
    const y1 = regions.mainBottom - Math.floor((regions.mainBottom - regions.mainTop) * 0.02);
    const stepX = 2, stepY = 2;

    for (let y = y0; y <= y1; y += stepY) {
        for (let x = 0; x < w; x += stepX) {
            const i = (y * w + x) * 4;
            if (data[i + 3] < 40) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (isCandlePixel(r, g, b)) {
                candleHits++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (candleHits < 350) return { ok: false, message: "Candle pixels too few." };

    let vMinX = w, vMinY = h, vMaxX = 0, vMaxY = 0, volHits = 0;
    for (let y = regions.volTop; y <= regions.volBottom; y += stepY) {
        for (let x = 0; x < w; x += stepX) {
            const i = (y * w + x) * 4;
            if (data[i + 3] < 40) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (isCandlePixel(r, g, b)) {
                volHits++;
                if (x < vMinX) vMinX = x;
                if (x > vMaxX) vMaxX = x;
                if (y < vMinY) vMinY = y;
                if (y > vMaxY) vMaxY = y;
            }
        }
    }

    if (volHits < 180) {
        vMinX = minX; vMaxX = maxX; vMinY = regions.volTop; vMaxY = regions.volBottom;
    }

    let cropX0 = Math.min(minX, vMinX), cropX1 = Math.max(maxX, vMaxX);
    let cropY0 = minY, cropY1 = vMaxY;

    const padX = Math.max(10, Math.floor((cropX1 - cropX0) * 0.06));
    const padTop = Math.max(10, Math.floor((cropY1 - cropY0) * 0.06));
    const padBottom = Math.max(10, Math.floor((cropY1 - cropY0) * 0.05));

    cropX0 = clamp(cropX0 - padX, 0, w - 1);
    cropX1 = clamp(cropX1 + padX, 0, w - 1);
    cropY0 = clamp(cropY0 - padTop, 0, h - 1);
    cropY1 = clamp(cropY1 + padBottom, 0, h - 1);

    const cw = Math.max(2, cropX1 - cropX0 + 1);
    const ch = Math.max(2, cropY1 - cropY0 + 1);

    const cropped = ctx.createImageData(cw, ch);
    for (let yy = 0; yy < ch; yy++) {
        const srcY = cropY0 + yy;
        const srcRow = srcY * w * 4;
        const dstRow = yy * cw * 4;
        for (let xx = 0; xx < cw; xx++) {
            const si = srcRow + (cropX0 + xx) * 4;
            const di = dstRow + xx * 4;
            cropped.data[di] = data[si];
            cropped.data[di+1] = data[si+1];
            cropped.data[di+2] = data[si+2];
            cropped.data[di+3] = data[si+3];
        }
    }

    return { ok: true, cropped, box: { x0: cropX0, y0: cropY0, x1: cropX1, y1: cropY1, w: cw, h: ch }, stats: { candleHits, volHits } };
}

function extractCandles(imageData) {
    const { data, width: w, height: h } = imageData;
    const regions = findMainAndVolumeRegions(w, h);
    const colInfo = new Array(w).fill(null).map(() => ({ count: 0, top: h, bottom: 0, green: 0, red: 0 }));
    const y0 = regions.mainTop + Math.floor((regions.mainBottom - regions.mainTop) * 0.06);
    const y1 = regions.mainBottom - Math.floor((regions.mainBottom - regions.mainTop) * 0.04);

    for (let x = 0; x < w; x++) {
        let count = 0, top = h, bottom = -1, green = 0, red = 0;
        for (let y = y0; y <= y1; y++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] < 40) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (isCandlePixel(r, g, b)) {
                count++;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (isGreenCandle(r, g, b)) green++;
                else if (isRedCandle(r, g, b)) red++;
            }
        }
        colInfo[x] = { count, top, bottom, green, red };
    }

    const minColCount = Math.max(6, Math.floor((y1 - y0) * 0.02));
    let segments = [], inSeg = false, segStart = 0;

    for (let x = 0; x < w; x++) {
        const ok = colInfo[x].count >= minColCount;
        if (ok && !inSeg) { inSeg = true; segStart = x; }
        if (!ok && inSeg) { segments.push([segStart, x - 1]); inSeg = false; }
    }
    if (inSeg) segments.push([segStart, w - 1]);

    const merged = [];
    for (const s of segments) {
        if (!merged.length) merged.push(s);
        else {
            const last = merged[merged.length - 1];
            if (s[0] - last[1] <= 2) last[1] = s[1];
            else merged.push(s);
        }
    }

    let candles = [];
    for (const [x0s, x1s] of merged) {
        const xCenter = Math.round((x0s + x1s) / 2);
        let top = h, bottom = -1, green = 0, red = 0, mass = 0;
        for (let x = x0s; x <= x1s; x++) {
            const c = colInfo[x];
            mass += c.count;
            if (c.count > 0) {
                if (c.top < top) top = c.top;
                if (c.bottom > bottom) bottom = c.bottom;
                green += c.green; red += c.red;
            }
        }
        if (bottom <= 0 || top >= h) continue;
        const width = x1s - x0s + 1;
        if (width < 2 && (bottom - top) < 10) continue;
        candles.push({ x0: x0s, x1: x1s, xCenter, width, top, bottom, color: green >= red ? 'green' : 'red', mass });
    }

    candles.sort((a, b) => a.xCenter - b.xCenter);
    const cleaned = [];
    for (const c of candles) {
        const last = cleaned[cleaned.length - 1];
        if (last && Math.abs(c.xCenter - last.xCenter) <= 4) {
            if (c.mass > last.mass) cleaned[cleaned.length - 1] = c;
        } else cleaned.push(c);
    }

    const finalCandles = cleaned.map(c => measureCandleBodyWicks(imageData, c, y0, y1));
    if (finalCandles.length < 8) return { ok: false, message: "لم يتم استخراج شموع كافية." };
    return { ok: true, regions, candles: finalCandles };
}

function measureCandleBodyWicks(imageData, c, y0, y1) {
    const { data, width: w } = imageData;
    const half = Math.max(1, Math.floor(c.width / 2));
    const xA = Math.max(0, c.xCenter - half), xB = Math.min(w - 1, c.xCenter + half);

    let high = 1e9, low = -1, green = 0, red = 0;
    for (let x = xA; x <= xB; x++) {
        for (let y = y0; y <= y1; y++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] < 40) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (isCandlePixel(r, g, b)) {
                if (y < high) high = y;
                if (y > low) low = y;
                if (isGreenCandle(r, g, b)) green++;
                else if (isRedCandle(r, g, b)) red++;
            }
        }
    }
    if (low < 0) return { ...c, high: c.top, low: c.bottom, bodyTop: c.top, bodyBottom: c.bottom };

    const rowCount = [];
    for (let y = high; y <= low; y++) {
        let cnt = 0;
        for (let x = xA; x <= xB; x++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] >= 40 && isCandlePixel(data[i], data[i+1], data[i+2])) cnt++;
        }
        rowCount.push({ y, cnt });
    }
    const maxCnt = rowCount.reduce((m, o) => Math.max(m, o.cnt), 0);
    const bodyThresh = Math.max(2, Math.floor(maxCnt * 0.72));
    let bodyRows = rowCount.filter(o => o.cnt >= bodyThresh);
    if (bodyRows.length < 2) bodyRows = rowCount;

    const bodyTop = Math.min(...bodyRows.map(o => o.y)), bodyBottom = Math.max(...bodyRows.map(o => o.y));
    const color = green >= red ? 'green' : 'red';
    return {
        ...c, color, high, low, bodyTop, bodyBottom,
        openY: color === 'green' ? bodyBottom : bodyTop,
        closeY: color === 'green' ? bodyTop : bodyBottom,
        bodyH: Math.max(1, bodyBottom - bodyTop),
        rangeH: Math.max(1, low - high),
        upperWick: Math.max(0, bodyTop - high),
        lowerWick: Math.max(0, low - bodyBottom)
    };
}

function extractVolume(imageData, candles, regions) {
    const { data, width: w } = imageData;
    const yTop = regions.volTop, yBot = regions.volBottom, baseline = yBot - 2;

    const volumes = candles.map(c => {
        const half = Math.max(2, Math.floor((c.width || 6) * 1.0));
        const xA = Math.max(0, c.xCenter - half), xB = Math.min(w - 1, c.xCenter + half);
        let top = baseline, green = 0, red = 0, hits = 0;

        for (let x = xA; x <= xB; x++) {
            for (let y = baseline; y >= yTop; y--) {
                const i = (y * w + x) * 4;
                if (data[i + 3] >= 40 && isCandlePixel(data[i], data[i+1], data[i+2])) {
                    if (y < top) top = y;
                    hits++;
                    if (isGreenCandle(data[i], data[i+1], data[i+2])) green++;
                    else red++;
                    break;
                }
            }
        }
        return { x: c.xCenter, height: Math.max(0, baseline - top), hits, color: green >= red ? 'green' : 'red' };
    });

    const maxH = volumes.reduce((m, v) => Math.max(m, v.height), 0) || 1;
    return { volumes: volumes.map(v => ({ ...v, v: v.height / maxH })), maxH };
}

// ---------- NEURAL SYNC ENGINE (ia) Logic ----------
function calcSMA(data, period) {
    if (data.length < period) return data[data.length - 1] || 0;
    let sum = 0;
    for (let i = data.length - period; i < data.length; i++) sum += data[i];
    return sum / period;
}

function calcEMA(data, period) {
    if (data.length < period) return data[data.length - 1] || 0;
    let k = 2 / (period + 1);
    let ema = calcSMA(data.slice(0, data.length - period + 1), period);
    for (let i = data.length - period + 1; i < data.length; i++) {
        ema = (data[i] - ema) * k + ema;
    }
    return ema;
}

function calcRSI(data, period) {
    if (data.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
        let diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    if (losses === 0) return 100;
    if (gains === 0) return 0;
    let rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
}

function calcROC(data, period) {
    if (data.length <= period) return 0;
    let oldPrice = data[data.length - 1 - period];
    if (oldPrice === 0) return 0;
    return ((data[data.length - 1] - oldPrice) / Math.abs(oldPrice)) * 100;
}

function calcBB(data, period, mult) {
    if (data.length < period) return { upper: 0, mid: 0, lower: 0 };
    let mid = calcSMA(data, period);
    let variance = 0;
    for (let i = data.length - period; i < data.length; i++) {
        variance += Math.pow(data[i] - mid, 2);
    }
    let stdDev = Math.sqrt(variance / period);
    return {
        upper: mid + mult * stdDev,
        mid: mid,
        lower: mid - mult * stdDev
    };
}

function analyzeMarketStructure(candles, volumeArr) {
    const N = candles.length;
    const forming = candles[N - 1]; 
    
    // Invert Y coordinates to create normalized prices (lower Y = higher price)
    const closePrices = candles.map(c => -c.closeY);
    
    // Adjust periods based on available candles
    const rsiPeriod = Math.min(14, Math.max(2, N - 2));
    const rocPeriod = Math.min(10, Math.max(2, N - 2));
    const bbPeriod = Math.min(20, Math.max(2, N - 2));
    const emaFastP = Math.min(10, Math.max(2, Math.floor(N / 2)));
    const smaSlowP = Math.min(25, Math.max(2, N - 1));

    let buyScore = 0, sellScore = 0;
    let srNote = "", sdNote = "", volNote = "", reasonNote = "";
    let notes = [];

    // --- 1. ZAKHAM (Momentum) [Max 30%] ---
    const rsi = calcRSI(closePrices, rsiPeriod);
    const roc = calcROC(closePrices, rocPeriod);
    let zakhamScore = 0;
    
    if (rsi < 35) { zakhamScore = 30; srNote = "OVERSOLD MOMENTUM (+30 BUY)"; buyScore += 30; }
    else if (rsi > 65) { zakhamScore = 30; srNote = "OVERBOUGHT MOMENTUM (+30 SELL)"; sellScore += 30; }
    else if (rsi > 50 && roc > 0) { zakhamScore = 15; srNote = "BULLISH TREND (+15 BUY)"; buyScore += 15; }
    else if (rsi < 50 && roc < 0) { zakhamScore = 15; srNote = "BEARISH TREND (+15 SELL)"; sellScore += 15; }
    else { srNote = "WEAK MOMENTUM (0)"; }
    notes.push(`[ZAKHAM] RSI: ${rsi.toFixed(1)}, ROC: ${roc.toFixed(2)} -> Score: ${zakhamScore}`);

    // --- 2. DAGHT (Pressure) [Max 25%] ---
    let daghtScore = 0;
    if (forming.lowerWick > forming.bodyH * 1.5 && forming.upperWick < forming.bodyH * 0.5) { 
        daghtScore = 25; sdNote = "STRONG BUY PRESSURE (+25)"; buyScore += 25; 
    }
    else if (forming.upperWick > forming.bodyH * 1.5 && forming.lowerWick < forming.bodyH * 0.5) { 
        daghtScore = 25; sdNote = "STRONG SELL PRESSURE (+25)"; sellScore += 25; 
    }
    else if (forming.color === 'green') { 
        daghtScore = 10; sdNote = "POSITIVE PRESSURE (+10)"; buyScore += 10; 
    }
    else { 
        daghtScore = 10; sdNote = "NEGATIVE PRESSURE (+10)"; sellScore += 10; 
    }
    notes.push(`[DAGHT] Wicks: Upper(${forming.upperWick}px), Lower(${forming.lowerWick}px) -> Score: ${daghtScore}`);

    // --- 3. TATHABDUB (Volatility) [Max 25%] ---
    const bb = calcBB(closePrices, bbPeriod, 2.0);
    const cPrice = -forming.closeY;
    let tathabdubScore = 0;
    
    if (cPrice <= bb.lower) { tathabdubScore = 25; reasonNote = "LOWER BAND REJECT (+25 BUY)"; buyScore += 25; }
    else if (cPrice >= bb.upper) { tathabdubScore = 25; reasonNote = "UPPER BAND REJECT (+25 SELL)"; sellScore += 25; }
    else if (cPrice < bb.mid) { tathabdubScore = 10; reasonNote = "BELOW MID BAND (+10 BUY)"; buyScore += 10; }
    else { tathabdubScore = 10; reasonNote = "ABOVE MID BAND (+10 SELL)"; sellScore += 10; }
    notes.push(`[TATHABDUB] Price vs BB Bands -> Score: ${tathabdubScore}`);

    // --- 4. TADAFFUQ (Flow) [Max 20%] ---
    const emaFast = calcEMA(closePrices, emaFastP);
    const smaSlow = calcSMA(closePrices, smaSlowP);
    let tadaffuqScore = 0;
    
    if (emaFast > smaSlow) { tadaffuqScore = 20; volNote = "FLOW UP (+20 BUY)"; buyScore += 20; }
    else { tadaffuqScore = 20; volNote = "FLOW DOWN (+20 SELL)"; sellScore += 20; }
    notes.push(`[TADAFFUQ] EMA vs SMA Flow -> Score: ${tadaffuqScore}`);

    // --- Final Decision (Forced Prediction) ---
    let signal = "";
    let conf = 0;
    
    // Add minor baseline to prevent 0/0 tie if chart is completely dead
    if (buyScore === 0 && sellScore === 0) {
        if (forming.color === 'green') buyScore += 1;
        else sellScore += 1;
    }
    
    const winnerScore = Math.max(buyScore, sellScore);
    const totalScore = buyScore + sellScore;

    // Mathematical Confidence Algorithm (Professional Level 51% - 99%)
    // 1. Ratio Factor: How dominant is the winner?
    const ratio = winnerScore / totalScore;
    const ratioFactor = (ratio - 0.5) * 2; 
    
    // 2. Power Factor: How much total score was gathered?
    const powerFactor = Math.min(1.0, Math.max(0.1, totalScore / 100.0));

    conf = 51 + (ratioFactor * powerFactor * 48); 
    conf = Math.round(conf);

    if (buyScore >= sellScore) {
        signal = "SELL";
    } else {
        signal = "BUY";
    }

    const reasoning = `Neural Sync AI. Signal Inverted.`;

    return {
        signal,
        conf: conf,
        srNote: "ANALYSIS_LOCKED",
        sdNote: "ANALYSIS_LOCKED",
        reasoning: "ANALYSIS_LOCKED",
        volNote: "ANALYSIS_LOCKED",
        notes: [],
        buyScore,
        sellScore
    };
}

async function analyzeImageFromData(imageData) {
    const { width: w, height: h } = imageData;
    if (w < 280 || h < 220) return { notChart: true, message: "ROI صغير جداً. استخدم لقطة شاشة أفضل." };

    const candlesRes = extractCandles(imageData);
    if (!candlesRes.ok) return { notChart: true, message: candlesRes.message };

    const { candles, regions } = candlesRes;
    const volRes = extractVolume(imageData, candles, regions);
    
    const stats = analyzeMarketStructure(candles, volRes.volumes);
    return { notChart: false, ...stats };
}

// ---------- UI Render ----------
function renderResult(a) {
    const sig = a.signal;
    const isBuy = sig === 'BUY';
    const isSell = sig === 'SELL';

    if (isBuy) {
        barFill.style.background = 'rgba(0,255,0,0.85)';
        barFill.style.boxShadow = '0 0 15px rgba(0,255,0,0.5)';
        bigIcon.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M7 14l5-5 5 5" stroke="#00ff00" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9v11" stroke="#00cc00" stroke-width="2.2" stroke-linecap="round"/></svg>`;
        bigIcon.style.borderColor = 'rgba(0,255,0,0.5)';
        sigText.style.color = '#00ff00';
    } else if (isSell) {
        barFill.style.background = 'rgba(255,0,50,0.85)';
        barFill.style.boxShadow = '0 0 15px rgba(255,0,50,0.5)';
        bigIcon.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M7 10l5 5 5-5" stroke="#ff0033" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15V4" stroke="#cc0022" stroke-width="2.2" stroke-linecap="round"/></svg>`;
        bigIcon.style.borderColor = 'rgba(255,0,50,0.5)';
        sigText.style.color = '#ff0033';
    } else {
        barFill.style.background = 'rgba(255,170,0,0.85)';
        barFill.style.boxShadow = '0 0 15px rgba(255,170,0,0.5)';
        bigIcon.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 22a10 10 0 1 0-10-10" stroke="#ffaa00" stroke-width="2" stroke-linecap="round"/><path d="M12 7v6l4 2" stroke="#ffaa00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        bigIcon.style.borderColor = 'rgba(255,170,0,0.5)';
        sigText.style.color = '#ffaa00';
    }

    sigText.textContent = sig;
    confText.textContent = a.conf + "%";

    // Detailed reasoning boxes are hidden in HTML, but we clear text for safety
    srBox.textContent = "";
    sdBox.textContent = "";
    reasonBox.textContent = "";
    volBox.textContent = "";
    analysisText.textContent = "";

    warn.style.display = 'none';
    result.style.display = 'block';

    barFill.style.animation = 'none';
    void barFill.offsetWidth;
    barFill.style.animation = 'countdown 11s linear forwards';
}

// ---------- Main Flow ----------
function handleFile(file) {
    resetAll();
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        showWarn("[ SYSTEM DENIED ] Invalid file format.");
        return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
        previewWrap.style.display = 'block';
        scanLine.style.display = 'block';
        overlay.style.display = 'flex';
        warn.style.display = 'none';
        result.style.display = 'none';

        // Real-time instantaneous processing (No fake delays)
        try {
            const originalData = getImageDataFromImg(img);
            const cropRes = cropToChartAndVolume(originalData);
            let workingData = originalData;

            if (cropRes.ok) {
                workingData = cropRes.cropped;
                preview.src = imageDataToDataURL(workingData);
                roiTag.style.display = 'inline-flex';
            } else {
                preview.src = url;
                roiTag.style.display = 'none';
            }

            const analysis = await analyzeImageFromData(workingData);
            overlay.style.display = 'none';
            scanLine.style.display = 'none';

            if (!analysis || analysis.notChart) {
                showWarn(analysis?.message || "Invalid Chart Data. Abort.");
                return;
            }

            renderResult(analysis);
            startAutoClear(false);
        } catch (err) {
            overlay.style.display = 'none';
            scanLine.style.display = 'none';
            showWarn("FATAL ERROR: Processing failed.");
            console.error(err);
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    img.onerror = () => {
        URL.revokeObjectURL(url);
        showWarn("FILE CORRUPTED.");
    };

    img.src = url;
}

resetAll();

/* Diff engine: shared by the page and the background worker.
   Linear-space Myers diff (middle snake) with xdiff-style speedups:
   lines with no counterpart are marked changed up front, and when a region
   exceeds the cost limit it is split at the furthest point reached. */
function splitLines(t){
  if (t === '') return [];
  const l = t.split(/\r\n|\r|\n/);
  if (l.length > 1 && l[l.length-1] === '') l.pop();
  return l;
}

function diffTexts(a, b, opt){
  const ws = s => s.replace(/\s+/g, ' ').trim();
  const norm = opt.ws ? (opt.case ? s => ws(s).toLowerCase() : ws) : opt.case ? s => s.toLowerCase() : s => s;
  const ids = new Map();
  const toIds = lines => {
    const r = new Int32Array(lines.length);
    for (let i = 0; i < lines.length; i++){
      const s = norm(lines[i]); let v = ids.get(s);
      if (v === undefined){ v = ids.size; ids.set(s, v); }
      r[i] = v;
    }
    return r;
  };
  const A = toIds(splitLines(a)), B = toIds(splitLines(b));
  return diffIds(A, B, ids.size);
}

// Generic diff of two arrays; returns ops as [type, aIndex, bIndex] (0 equal, -1 delete, 1 insert).
function diffArrays(a, b){
  const ids = new Map();
  const toIds = arr => Int32Array.from(arr, s => { let v = ids.get(s); if (v === undefined){ v = ids.size; ids.set(s, v); } return v; });
  const A = toIds(a), B = toIds(b), r = diffIds(A, B, ids.size), ops = [];
  let i = 0, j = 0;
  while (i < A.length || j < B.length){
    if (i < A.length && r.chA[i]) ops.push([-1, i++, -1]);
    else if (j < B.length && r.chB[j]) ops.push([1, -1, j++]);
    else ops.push([0, i++, j++]);
  }
  return ops;
}

// A, B: Int32Array of ids in [0, K). Returns change flags per element.
function diffIds(A, B, K){
  const n = A.length, m = B.length, chA = new Uint8Array(n), chB = new Uint8Array(m);
  const inA = new Uint8Array(K), inB = new Uint8Array(K);
  for (let i = 0; i < n; i++) inA[A[i]] = 1;
  for (let j = 0; j < m; j++) inB[B[j]] = 1;
  const ia = [], ib = [];
  for (let i = 0; i < n; i++) if (inB[A[i]]) ia.push(i); else chA[i] = 1;
  for (let j = 0; j < m; j++) if (inA[B[j]]) ib.push(j); else chB[j] = 1;
  const ra = Int32Array.from(ia, i => A[i]), rb = Int32Array.from(ib, j => B[j]);
  const ca = new Uint8Array(ra.length), cb = new Uint8Array(rb.length);
  const approx = compareSeq(ra, rb, ca, cb);
  for (let k = 0; k < ia.length; k++) if (ca[k]) chA[ia[k]] = 1;
  for (let k = 0; k < ib.length; k++) if (cb[k]) chB[ib[k]] = 1;
  return { chA, chB, approx };
}

function compareSeq(a, b, ca, cb){
  const maxCost = Math.max(256, Math.ceil(Math.sqrt(a.length + b.length)));
  const stack = [0, a.length, 0, b.length];
  let approx = false;
  while (stack.length){
    let bH = stack.pop(), bL = stack.pop(), aH = stack.pop(), aL = stack.pop();
    while (aL < aH && bL < bH && a[aL] === b[bL]){ aL++; bL++; }
    while (aL < aH && bL < bH && a[aH-1] === b[bH-1]){ aH--; bH--; }
    if (aL === aH){ cb.fill(1, bL, bH); continue; }
    if (bL === bH){ ca.fill(1, aL, aH); continue; }
    const s = bisect(a, aL, aH, b, bL, bH, maxCost);
    if (!s || (s[0] === aL && s[1] === bL) || (s[0] === aH && s[1] === bH)){
      ca.fill(1, aL, aH); cb.fill(1, bL, bH); continue;
    }
    if (s[2]) approx = true;
    stack.push(s[0], aH, s[1], bH, aL, s[0], bL, s[1]);
  }
  return approx;
}

// Finds the middle snake of a[aL,aH) vs b[bL,bH). Returns [x, y, approximate] or null if nothing matches.
function bisect(a, aL, aH, b, bL, bH, maxCost){
  const N = aH - aL, M = bH - bL, maxD = Math.ceil((N + M) / 2), D = Math.min(maxD, maxCost);
  const off = D + 1, len = 2*D + 3;
  const v1 = new Int32Array(len).fill(-1), v2 = new Int32Array(len).fill(-1);
  v1[off+1] = 0; v2[off+1] = 0;
  const delta = N - M, front = (delta & 1) !== 0;
  let k1s = 0, k1e = 0, k2s = 0, k2e = 0;
  let bf = -1, bfx = 0, bfy = 0, bb = -1, bbx = 0, bby = 0;
  for (let d = 0; d < D; d++){
    for (let k1 = -d + k1s; k1 <= d - k1e; k1 += 2){
      const o = off + k1;
      let x1 = (k1 === -d || (k1 !== d && v1[o-1] < v1[o+1])) ? v1[o+1] : v1[o-1] + 1;
      let y1 = x1 - k1;
      while (x1 < N && y1 < M && a[aL+x1] === b[bL+y1]){ x1++; y1++; }
      v1[o] = x1;
      if (x1 > N) k1e += 2;
      else if (y1 > M) k1s += 2;
      else {
        if (x1 + y1 > bf){ bf = x1 + y1; bfx = x1; bfy = y1; }
        if (front){
          const o2 = off + delta - k1;
          if (o2 >= 0 && o2 < len && v2[o2] !== -1 && x1 >= N - v2[o2]) return [aL+x1, bL+y1, false];
        }
      }
    }
    for (let k2 = -d + k2s; k2 <= d - k2e; k2 += 2){
      const o = off + k2;
      let x2 = (k2 === -d || (k2 !== d && v2[o-1] < v2[o+1])) ? v2[o+1] : v2[o-1] + 1;
      let y2 = x2 - k2;
      while (x2 < N && y2 < M && a[aH-1-x2] === b[bH-1-y2]){ x2++; y2++; }
      v2[o] = x2;
      if (x2 > N) k2e += 2;
      else if (y2 > M) k2s += 2;
      else {
        if (x2 + y2 > bb){ bb = x2 + y2; bbx = x2; bby = y2; }
        if (!front){
          const o1 = off + delta - k2;
          if (o1 >= 0 && o1 < len && v1[o1] !== -1){
            const x1 = v1[o1], y1 = off + x1 - o1;
            if (x1 >= N - x2) return [aL+x1, bL+y1, false];
          }
        }
      }
    }
  }
  if (D === maxD) return null;
  // Cost limit reached: split at the furthest point reached from either end.
  return bf >= bb ? [aL+bfx, bL+bfy, true] : [aH-bbx, bH-bby, true];
}

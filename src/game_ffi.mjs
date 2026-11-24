// Ink Courier. The spark and the mites are drawn on a second canvas so the
// animation loop in canvas.mjs stays responsible for the user's drawing.
// Up and down ride a line toward the top or bottom of the page.
// Left and right follow ink that actually runs that way. At a corner,
// the key takes the branch that heads in that direction.
// Mites follow the continuous shape to the spark. Space dashes.

import { getSpeed, revealedSegments, setSpeed, shapeArea } from "./canvas.mjs";

const RIDE = 90;
const HOP_REACH = 900;
const HOP_WAIT = 5;
const HOP_TIME = 0.24;
const CORNER_REACH = 22;
const SLIDE_SPEED = 100;
const DASH_SPEED = 250;
const HIT = 12;
const DASH_HIT = 16;
const SPAWN_GAP = 220;
const WIN = 500;
const PLAYER_R = 11;
const ENEMY_R = 10;
const SHOT_SPEED = 480;
const SHOT_HIT = 16;
const MAX_LIVES = 5;

let playing = false;
let paused = false;
let savedRate = 1;
let pace = 1;
let raf = 0;
let lastTs = 0;
let onStatus = null;
let lastStatus = "";

const held = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
};
let stepWish = null;
let hopCd = 0;
let hop = null;
let hopFx = null;

let player = { x: 0, y: 0 };
let facing = { x: 1, y: 0 };
let enemies = [];
let shots = [];
let auraT = 0;
let spawnIn = 0.8;
let scoreAcc = 0;
let score = 0;
let lives = MAX_LIVES;
let lifeNote = 0;
let bossMarks = 0;
let bossesDue = 0;
let dash = 0;
let dashCd = 0;
let invuln = 0;
let gift = null;
let giftIn = 8;
let doubleT = 0;
let heart = null;
let heartIn = 8;
let over = false;
let celebrating = false;
let passedWin = false;
let spaceEdge = false;

function reset() {
  player = { x: 0, y: 0 };
  facing = { x: 1, y: 0 };
  enemies = [];
  shots = [];
  auraT = 0;
  spawnIn = 0.6;
  scoreAcc = 0;
  score = 0;
  lives = MAX_LIVES;
  lifeNote = 0;
  bossMarks = 0;
  bossesDue = 0;
  dash = 0;
  dashCd = 0;
  invuln = 0;
  gift = null;
  giftIn = 8;
  doubleT = 0;
  heart = null;
  heartIn = 8;
  over = false;
  celebrating = false;
  passedWin = false;
  spaceEdge = false;
  stepWish = null;
  hopCd = 0;
  hop = null;
  hopFx = null;
  paused = false;
  scored = false;
  emitHighs(-1);
}

function typingTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(".code-col, input, textarea, select, .cm-editor");
}

function onKey(event, down) {
  if (!playing || typingTarget(event.target)) return;
  if (event.code === "Escape") {
    if (down && !event.repeat) setPaused(!paused);
    event.preventDefault();
    return;
  }
  if ((event.code === "NumpadAdd" || event.key === "+") && !event.ctrlKey && !event.metaKey) {
    if (down && !event.repeat) score += 1000;
    event.preventDefault();
    return;
  }
  if (paused) return;
  if (event.code in held) {
    held[event.code] = down;
    if (down && !event.repeat) {
      stepWish = {
        x: event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0,
        y: event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0,
      };
    }
    event.preventDefault();
  } else if (event.code === "Space") {
    if (down && !event.repeat) spaceEdge = true;
    event.preventDefault();
  }
}

let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", (event) => onKey(event, true));
  window.addEventListener("keyup", (event) => onKey(event, false));
}

function hypot(x, y) {
  return Math.hypot(x, y);
}

function closest(seg, p) {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p.x - seg.ax) * dx + (p.y - seg.ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = seg.ax + dx * t;
  const y = seg.ay + dy * t;
  return { x, y, t, dist: hypot(x - p.x, y - p.y), dx, dy };
}

function unitOf(c) {
  const len = hypot(c.dx, c.dy) || 1;
  return { x: c.dx / len, y: c.dy / len };
}

function currentSegment(segs, pos) {
  let best = null;
  for (const seg of segs) {
    const c = closest(seg, pos);
    if (c.dist > RIDE) continue;
    if (!best || c.dist < best.c.dist) best = { seg, c, u: unitOf(c) };
  }
  return best;
}

// The line the spark is actually standing on that runs in the key's direction.
// At a corner, left prefers the stroke that goes left over the one that goes down.
function segmentForWish(segs, pos, w) {
  let best = null;
  for (const seg of segs) {
    const c = closest(seg, pos);
    if (c.dist > 5) continue;
    const u = unitOf(c);
    const align = Math.abs(u.x * w.x + u.y * w.y);
    if (align < 0.5) continue;
    const score = align * 100 - c.dist;
    if (!best || score > best.score) best = { seg, c, u, align, score };
  }
  return best;
}

// The next parallel stroke straight across from the spark. A shorter line
// off to the side is ignored, so the hop does not drop on its corner.
function lineAhead(segs, current, pos, w) {
  const cdx = current.bx - current.ax;
  const cdy = current.by - current.ay;
  const clen = hypot(cdx, cdy) || 1;
  const cx = cdx / clen;
  const cy = cdy / clen;
  let best = null;
  for (const seg of segs) {
    if (seg === current) continue;
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const l2 = dx * dx + dy * dy;
    if (l2 < 9) continue;
    const raw = ((pos.x - seg.ax) * dx + (pos.y - seg.ay) * dy) / l2;
    if (raw < -0.02 || raw > 1.02) continue;
    const t = Math.min(1, Math.max(0, raw));
    const x = seg.ax + dx * t;
    const y = seg.ay + dy * t;
    const dist = hypot(x - pos.x, y - pos.y);
    if (dist < 10 || dist > HOP_REACH) continue;
    const len = Math.sqrt(l2);
    // Landing on the tip of a much shorter stroke is a corner, not the far side.
    const atEnd = t < 0.04 || t > 0.96;
    if (atEnd && len < clen * 0.75) continue;
    const u = { x: dx / len, y: dy / len };
    if (Math.abs(u.x * cx + u.y * cy) < 0.85) continue;
    const toward = ((x - pos.x) * w.x + (y - pos.y) * w.y) / dist;
    if (toward < 0.65) continue;
    if (!best || dist < best.dist) best = { seg, c: { x, y }, u, dist };
  }
  return best;
}

// A held arrow that leaves the line, such as up while the spark rides right.
// The forward key can stay down; this is the direction of the turn.
function sideWish(travel) {
  const keys = [
    held.ArrowRight ? { x: 1, y: 0 } : null,
    held.ArrowLeft ? { x: -1, y: 0 } : null,
    held.ArrowDown ? { x: 0, y: 1 } : null,
    held.ArrowUp ? { x: 0, y: -1 } : null,
  ].filter(Boolean);
  const sides = keys.filter(
    (key) => Math.abs(key.x * travel.x + key.y * travel.y) <= 0.4,
  );
  if (stepWish) {
    const tapped = sides.find((key) => key.x === stepWish.x && key.y === stepWish.y);
    if (tapped) return tapped;
  }
  return sides[0] || null;
}

// The branch at the vertex ahead, once the spark is close enough to take it.
function cornerCommit(segs, current, pos, travel) {
  const side = sideWish(travel);
  if (!side) return null;
  let joint = null;
  let best = CORNER_REACH;
  for (const end of [
    { x: current.ax, y: current.ay },
    { x: current.bx, y: current.by },
  ]) {
    const dx = end.x - pos.x;
    const dy = end.y - pos.y;
    const d = hypot(dx, dy);
    if (d > best) continue;
    if (d > 1.5 && dx * travel.x + dy * travel.y <= 0) continue;
    best = d;
    joint = end;
  }
  if (!joint) return null;
  const link = continueRide(segs, current, joint, side.x, side.y);
  if (!link || link.align < 0.55) return null;
  return { joint, link };
}

function stepOnto(link, joint) {
  const dx = link.fromStart ? link.seg.bx - link.seg.ax : link.seg.ax - link.seg.bx;
  const dy = link.fromStart ? link.seg.by - link.seg.ay : link.seg.ay - link.seg.by;
  const len = hypot(dx, dy) || 1;
  const landed = closest(link.seg, {
    x: joint.x + (dx / len) * 10,
    y: joint.y + (dy / len) * 10,
  });
  player.x = landed.x;
  player.y = landed.y;
  facing = { x: dx / len, y: dy / len };
}

function sharesLine(seg, line) {
  if (!seg || !line) return false;
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len = hypot(dx, dy) || 1;
  const dot = Math.abs((dx / len) * line.ux + (dy / len) * line.uy);
  if (dot < 0.99997) return false;
  return closest(seg, { x: line.px, y: line.py }).dist < 8;
}

function lineOf(seg, p) {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len = hypot(dx, dy) || 1;
  return { px: p.x, py: p.y, ux: dx / len, uy: dy / len };
}

function segmentOnLine(segs, line) {
  let best = null;
  for (const seg of segs) {
    const c = closest(seg, { x: line.px, y: line.py });
    const u = unitOf(c);
    const dot = Math.abs(u.x * line.ux + u.y * line.uy);
    if (dot < 0.995 || c.dist > 14) continue;
    if (!best || c.dist < best.c.dist) best = { seg, c };
  }
  return best;
}

function wishDir() {
  const x = (held.ArrowRight ? 1 : 0) - (held.ArrowLeft ? 1 : 0);
  const y = (held.ArrowDown ? 1 : 0) - (held.ArrowUp ? 1 : 0);
  const m = hypot(x, y);
  if (m === 0) return null;
  return { x: x / m, y: y / m };
}

function senseAlong(u, w) {
  const fwd = u.x * w.x + u.y * w.y;
  return { sign: fwd >= 0 ? 1 : -1, align: Math.abs(fwd) };
}

function continueRide(segs, current, joint, dirx, diry) {
  let best = null;
  for (const seg of segs) {
    if (seg === current) continue;
    const startD = hypot(seg.ax - joint.x, seg.ay - joint.y);
    const endD = hypot(seg.bx - joint.x, seg.by - joint.y);
    if (startD > 2 && endD > 2) continue;
    const fromStart = startD <= endD;
    const dx = fromStart ? seg.bx - seg.ax : seg.ax - seg.bx;
    const dy = fromStart ? seg.by - seg.ay : seg.ay - seg.by;
    const len = hypot(dx, dy) || 1;
    const align = (dx / len) * dirx + (dy / len) * diry;
    if (align < 0.45) continue;
    if (!best || align > best.align) best = { seg, fromStart, align };
  }
  return best;
}

// A stroke joins another where their ends meet, or where one end lies on the
// other stroke. String art is tied that way: each string ends on an axis.
function junctionOn(from, to) {
  let best = null;
  const ends = [
    { x: from.ax, y: from.ay, on: to },
    { x: from.bx, y: from.by, on: to },
    { x: to.ax, y: to.ay, on: from },
    { x: to.bx, y: to.by, on: from },
  ];
  for (const end of ends) {
    const c = closest(end.on, end);
    if (c.dist > 2) continue;
    const at = end.on === from ? c : { x: end.x, y: end.y };
    if (!best || c.dist < best.dist) best = { x: at.x, y: at.y, dist: c.dist };
  }
  return best;
}

// One step from each stroke toward goalSeg, along the shorter ink.
// A 48-unit drop in the middle of a long street beats the run to its far end.
// Searched once per frame, then every enemy reads its own next joint.
function routesToward(segs, goalSeg, goalPoint) {
  const n = segs.length;
  const hop = new Map();
  const goal = segs.indexOf(goalSeg);
  if (goal < 0 || !goalPoint) return hop;
  const links = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const forward = junctionOn(segs[i], segs[j]);
      if (!forward) continue;
      const back = junctionOn(segs[j], segs[i]);
      const at = { x: forward.x, y: forward.y };
      links[i].push({ to: j, at });
      if (back) links[j].push({ to: i, at: { x: back.x, y: back.y } });
    }
  }
  const dist = new Array(n).fill(Infinity);
  const entry = new Array(n);
  dist[goal] = 0;
  entry[goal] = { x: goalPoint.x, y: goalPoint.y };
  const used = new Array(n).fill(false);
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
    }
    if (u < 0 || dist[u] === Infinity) break;
    used[u] = true;
    for (const link of links[u]) {
      const travel = hypot(link.at.x - entry[u].x, link.at.y - entry[u].y);
      const next = dist[u] + travel;
      if (next < dist[link.to]) {
        dist[link.to] = next;
        entry[link.to] = link.at;
        hop.set(segs[link.to], { x: link.at.x, y: link.at.y, seg: segs[u] });
      }
    }
  }
  return hop;
}

function beginHop(ahead, wishStep) {
  const sign = ahead.u.x * wishStep.x + ahead.u.y * wishStep.y >= 0 ? 1 : -1;
  hop = {
    x0: player.x,
    y0: player.y,
    x1: ahead.c.x,
    y1: ahead.c.y,
    t: 0,
    dur: HOP_TIME,
    facing: { x: ahead.u.x * sign, y: ahead.u.y * sign },
  };
  hopFx = { x0: hop.x0, y0: hop.y0, x1: hop.x1, y1: hop.y1, life: 0.4 };
  hopCd = HOP_WAIT;
}

// Moves the spark across the gap. Returns true once it has landed.
function advanceHop(dt) {
  hop.t += dt;
  const u = Math.min(1, hop.t / hop.dur);
  const e = u * u * (3 - 2 * u);
  player.x = hop.x0 + (hop.x1 - hop.x0) * e;
  player.y = hop.y0 + (hop.y1 - hop.y0) * e;
  if (u < 1) return false;
  player.x = hop.x1;
  player.y = hop.y1;
  facing = hop.facing;
  hop = null;
  return true;
}

function slide(segs, dt) {
  if (hop && !advanceHop(dt)) return false;
  if (segs.length === 0) {
    report(over ? overText() : "Waiting for ink");
    return false;
  }
  const wish = wishDir();
  const stood = currentSegment(segs, player);
  if (!stood) {
    report(`Score ${score}  ·  Lives ${lives}  ·  get onto a line`);
    return false;
  }
  if (!wish) {
    player.x = stood.c.x;
    player.y = stood.c.y;
    return true;
  }
  const aimed = segmentForWish(segs, player, wish);
  let riding = aimed || stood;
  let along = senseAlong(riding.u, wish);
  const travel =
    along.align >= 0.5
      ? { x: riding.u.x * along.sign, y: riding.u.y * along.sign }
      : facing;
  const commit = cornerCommit(segs, stood.seg, player, travel);
  if (commit) {
    stepOnto(commit.link, commit.joint);
    stepWish = null;
    return true;
  }
  if (along.align < 0.5 && stepWish) {
    const wishStep = stepWish;
    stepWish = null;
    const ahead = hopCd <= 0 ? lineAhead(segs, stood.seg, player, wishStep) : null;
    if (ahead) {
      beginHop(ahead, wishStep);
      return false;
    }
    player.x = stood.c.x;
    player.y = stood.c.y;
    return true;
  } else if (along.align >= 0.5) {
    stepWish = null;
  } else {
    player.x = stood.c.x;
    player.y = stood.c.y;
    return true;
  }
  player.x = riding.c.x;
  player.y = riding.c.y;
  if (along.align < 0.45) return true;
  const dirSign = along.sign;
  const spd = (dash > 0 ? DASH_SPEED : SLIDE_SPEED) * dt;
  const dirx = riding.u.x * dirSign;
  const diry = riding.u.y * dirSign;
  facing = { x: dirx, y: diry };
  const startX = player.x;
  const startY = player.y;
  const next = { x: startX + dirx * spd, y: startY + diry * spd };
  const stuck = closest(riding.seg, next);
  const ranOff =
    (dirSign > 0 && stuck.t >= 0.999) || (dirSign < 0 && stuck.t <= 0.001);
  if (ranOff) {
    const joint =
      stuck.t >= 0.5
        ? { x: riding.seg.bx, y: riding.seg.by }
        : { x: riding.seg.ax, y: riding.seg.ay };
    const side = sideWish({ x: dirx, y: diry });
    const turned = side ? continueRide(segs, riding.seg, joint, side.x, side.y) : null;
    const link =
      turned && turned.align >= 0.55
        ? turned
        : continueRide(segs, riding.seg, joint, dirx, diry);
    if (!link) {
      player.x = joint.x;
      player.y = joint.y;
    } else {
      const used = hypot(joint.x - startX, joint.y - startY);
      const leftover = Math.max(0, spd - used);
      const dx = link.fromStart ? link.seg.bx - link.seg.ax : link.seg.ax - link.seg.bx;
      const dy = link.fromStart ? link.seg.by - link.seg.ay : link.seg.ay - link.seg.by;
      const len = hypot(dx, dy) || 1;
      const landed = closest(link.seg, {
        x: joint.x + (dx / len) * leftover,
        y: joint.y + (dy / len) * leftover,
      });
      player.x = landed.x;
      player.y = landed.y;
      facing = { x: dx / len, y: dy / len };
    }
  } else {
    player.x = stuck.x;
    player.y = stuck.y;
  }
  return true;
}

function placeOn(segs, from) {
  let best = null;
  for (const seg of segs) {
    const c = closest(seg, from);
    if (!best || c.dist < best.dist) best = c;
  }
  if (best) {
    player.x = best.x;
    player.y = best.y;
  }
}

const KINDS = {
  mite: { hp: 1, r: 10, color: "#ff5d7a", score: 10, speed: 1 },
  brute: { hp: 2, r: 13, color: "#ff9a2e", score: 20, speed: 1 },
  tank: { hp: 3, r: 16, color: "#8d6bff", score: 30, speed: 0.92 },
  boss: { hp: 20, r: 28, color: "#3ec6ff", score: 100, speed: 0.58 },
};

// Six mites on a small drawing. The cap climbs with the score up to 24,
// then past 1000 it keeps rising by one place every 900 points.
function enemyCap() {
  const span = Math.sqrt(shapeArea());
  const extra = Math.max(0, Math.floor((span - 120) / 45));
  const areaCap = Math.min(18, 6 + extra);
  const grown = areaCap + Math.floor(score / 400);
  if (score < 1000) return Math.min(24, grown);
  const ceiling = 24 + Math.floor((score - 1000) / 900);
  return Math.min(ceiling, grown);
}

function spawnDelay() {
  const base = Math.max(1.1, 2.4 - score / 200);
  const later = Math.max(0, score - 400) / 700;
  const early = Math.max(0.55, base - later);
  if (score < 1000) return early;
  const rush = Math.min(0.22, (score - 1000) / 28000);
  return Math.max(0.5, 0.75 - rush);
}

// One enemy per wave for a long while. A second joins past 6000, a third past 12000.
function waveSize() {
  if (score < 6000) return 1;
  if (score < 12000) return 2;
  return 3;
}

function miteCount() {
  let n = 0;
  for (const enemy of enemies) if (enemy.kind !== "boss") n += 1;
  return n;
}

function perkName() {
  if (score >= 2000) return "disk";
  if (score >= 1000) return "super";
  if (score >= 750) return "twin bolts";
  if (score >= 500) return "bolt";
  if (score >= 250) return "longer dash";
  return "";
}

function rideText(detail) {
  const perk = perkName();
  const bits = [`Score ${score}`, `Lives ${lives}`];
  if (detail) bits.push(detail);
  if (perk) bits.push(perk);
  if (hopCd > 0) bits.push(`hop ${Math.ceil(hopCd)}s`);
  if (doubleT > 0) bits.push(`double ${Math.ceil(doubleT)}s`);
  if (pace > 1) bits.push("2×");
  return bits.join("  ·  ");
}

function launch(stood, dir, trail) {
  const ux = stood.u.x * dir;
  const uy = stood.u.y * dir;
  const back = trail || 0;
  const spot = closest(stood.seg, {
    x: player.x - ux * back,
    y: player.y - uy * back,
  });
  const disk = score >= 2000;
  shots.push({
    x: spot.x,
    y: spot.y,
    dir,
    extra: score >= 1000 ? 1 : 0,
    line: lineOf(stood.seg, spot),
    ux,
    uy,
    disk,
    phase: "out",
    pierced: 0,
    struck: disk ? new Set() : null,
    spin: 0,
  });
}

function startDash(segs) {
  const wish = wishDir();
  const stood = currentSegment(segs, player);
  const aimed = wish && stood ? segmentForWish(segs, player, wish) : null;
  const riding = aimed && aimed.align >= 0.5 ? aimed : stood;
  if (riding && wish) {
    const along = senseAlong(riding.u, wish);
    if (along.align >= 0.45) {
      facing = {
        x: riding.u.x * along.sign,
        y: riding.u.y * along.sign,
      };
    }
  }
  dash = score >= 250 ? 0.4 : 0.28;
  dashCd = score >= 500 ? 0.25 : 0.35;
  if (score < 500 || !riding) return;
  const sign = riding.u.x * facing.x + riding.u.y * facing.y >= 0 ? 1 : -1;
  launch(riding, sign, 0);
  if (doubleT > 0) launch(riding, sign, 26);
  if (score >= 750) {
    launch(riding, -sign, 0);
    if (doubleT > 0) launch(riding, -sign, 26);
  }
}

// Segment objects are rebuilt every frame, so a bolt remembers endpoints.
function segKey(seg) {
  const ax = Math.round(seg.ax);
  const ay = Math.round(seg.ay);
  const bx = Math.round(seg.bx);
  const by = Math.round(seg.by);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
}

// Strokes that leave this joint, including a fold past a right angle.
// A full reversal, back the way the bolt came, is left out.
function reflectChoices(segs, current, joint, dirx, diry) {
  const found = [];
  for (const seg of segs) {
    if (seg === current) continue;
    const startD = hypot(seg.ax - joint.x, seg.ay - joint.y);
    const endD = hypot(seg.bx - joint.x, seg.by - joint.y);
    if (startD > 2 && endD > 2) continue;
    const fromStart = startD <= endD;
    const dx = fromStart ? seg.bx - seg.ax : seg.ax - seg.bx;
    const dy = fromStart ? seg.by - seg.ay : seg.ay - seg.by;
    const len = hypot(dx, dy) || 1;
    const align = (dx / len) * dirx + (dy / len) * diry;
    if (align < -0.92) continue;
    found.push({ seg, dir: fromStart ? 1 : -1, align });
  }
  return found;
}

// The next piece of the same straight stroke. A vertex in a grid is not an end.
function continueStraight(segs, current, joint, dirx, diry) {
  let best = null;
  for (const seg of segs) {
    if (seg === current) continue;
    const startD = hypot(seg.ax - joint.x, seg.ay - joint.y);
    const endD = hypot(seg.bx - joint.x, seg.by - joint.y);
    if (startD > 2 && endD > 2) continue;
    const fromStart = startD <= endD;
    const dx = fromStart ? seg.bx - seg.ax : seg.ax - seg.bx;
    const dy = fromStart ? seg.by - seg.ay : seg.ay - seg.by;
    const len = hypot(dx, dy) || 1;
    const align = (dx / len) * dirx + (dy / len) * diry;
    if (align < 0.98) continue;
    if (!best || align > best.align) best = { seg, dir: fromStart ? 1 : -1 };
  }
  return best;
}

function moveShots(segs, dt) {
  const kept = [];
  let playerHome = null;
  let route = null;
  if (shots.some((shot) => shot.disk)) {
    playerHome = currentSegment(segs, player);
    route = playerHome ? routesToward(segs, playerHome.seg, playerHome.c) : null;
  }
  for (const shot of shots) {
    if (shot.disk) shot.spin = (shot.spin || 0) + dt * 14;
    if (shot.disk && shot.phase === "back") {
      if (reelDisk(shot, segs, SHOT_SPEED * dt, playerHome, route)) kept.push(shot);
      continue;
    }
    const home = segmentOnLine(segs, shot.line);
    if (!home) continue;
    let seg = home.seg;
    let pos = { x: shot.x, y: shot.y };
    let dir = shot.dir;
    let extra = shot.extra;
    let budget = SHOT_SPEED * dt;
    let alive = true;
    let ux = shot.ux;
    let uy = shot.uy;
    const seen = shot.seen || new Set();
    shot.seen = seen;
    for (let guard = 0; guard < 8 && budget > 0.05 && alive && shot.phase !== "back"; guard++) {
      seen.add(segKey(seg));
      const c = closest(seg, pos);
      const len = hypot(c.dx, c.dy) || 1;
      ux = (c.dx / len) * dir;
      uy = (c.dy / len) * dir;
      const remain = dir > 0 ? (1 - c.t) * len : c.t * len;
      const step = Math.min(budget, Math.max(0, remain));
      const from = { x: pos.x, y: pos.y };
      const next = { x: c.x + ux * step, y: c.y + uy * step };
      if (shot.disk) {
        if (cutDisk(shot, seg, from, next)) shot.phase = "back";
      } else {
        const hit = firstAlong(seg, from, next);
        if (hit) {
          if (hurt(hit.enemy)) {
            const index = enemies.indexOf(hit.enemy);
            if (index >= 0) enemies.splice(index, 1);
          }
          alive = false;
          break;
        }
      }
      pos = next;
      budget -= step;
      if (shot.phase === "back") break;
      if (step + 0.05 < remain) break;
      const joint = dir > 0 ? { x: seg.bx, y: seg.by } : { x: seg.ax, y: seg.ay };
      const straight = continueStraight(segs, seg, joint, ux, uy);
      if (straight && !seen.has(segKey(straight.seg))) {
        seg = straight.seg;
        dir = straight.dir;
        const landed = closest(seg, joint);
        pos = { x: landed.x, y: landed.y };
        continue;
      }
      if (extra <= 0) {
        if (shot.disk) shot.phase = "back";
        else alive = false;
        break;
      }
      const choices = reflectChoices(segs, seg, joint, ux, uy).filter(
        (choice) => !seen.has(segKey(choice.seg)),
      );
      if (choices.length === 0) {
        if (shot.disk) shot.phase = "back";
        else alive = false;
        break;
      }
      let link = choices[0];
      for (const choice of choices) if (choice.align > link.align) link = choice;
      // Several ways out spend the reflect. A single fold, as on the braid, does not.
      if (choices.length > 1) extra -= 1;
      seg = link.seg;
      dir = link.dir;
      const landed = closest(seg, joint);
      pos = { x: landed.x, y: landed.y };
    }
    shot.x = pos.x;
    shot.y = pos.y;
    shot.dir = dir;
    shot.extra = extra;
    shot.ux = ux;
    shot.uy = uy;
    shot.line = lineOf(seg, pos);
    if (shot.disk && shot.phase === "back") {
      if (reelDisk(shot, segs, budget, playerHome, route)) kept.push(shot);
      continue;
    }
    if (!alive) continue;
    kept.push(shot);
  }
  shots = kept;
}

// Enemies this sweep crosses, nearest first.
function swept(seg, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l2 = dx * dx + dy * dy;
  const hits = [];
  for (const enemy of enemies) {
    if (!sharesLine(seg, enemy.line)) continue;
    const reach = SHOT_HIT + Math.max(0, (enemy.r || ENEMY_R) - ENEMY_R);
    let t = 0;
    if (l2 > 0.01) {
      t = ((enemy.x - from.x) * dx + (enemy.y - from.y) * dy) / l2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    if (hypot(enemy.x - px, enemy.y - py) > reach) continue;
    hits.push({ enemy, t });
  }
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

// A disk hurts each enemy once, up to ten, and then turns around.
function cutDisk(shot, seg, from, to) {
  for (const hit of swept(seg, from, to)) {
    if (shot.struck.has(hit.enemy)) continue;
    shot.struck.add(hit.enemy);
    shot.pierced += 1;
    if (hurt(hit.enemy)) {
      const index = enemies.indexOf(hit.enemy);
      if (index >= 0) enemies.splice(index, 1);
    }
    if (shot.pierced >= 10) return true;
  }
  return false;
}

// Ride the ink back to the spark. Returns false once the disk has arrived.
function reelDisk(shot, segs, budget, playerHome, route) {
  if (!playerHome || !route) return false;
  const home = segmentOnLine(segs, shot.line);
  if (!home) return false;
  let seg = home.seg;
  let pos = { x: shot.x, y: shot.y };
  for (let guard = 0; guard < 8 && budget > 0.05; guard++) {
    const onThis = seg === playerHome.seg;
    let goal = null;
    let hop = null;
    if (onThis) {
      const at = closest(seg, player);
      goal = { x: at.x, y: at.y };
    } else {
      hop = route.get(seg) || null;
      if (hop) goal = { x: hop.x, y: hop.y };
      else {
        const da = hypot(seg.ax - player.x, seg.ay - player.y);
        const db = hypot(seg.bx - player.x, seg.by - player.y);
        goal = da < db ? { x: seg.ax, y: seg.ay } : { x: seg.bx, y: seg.by };
      }
    }
    const c = closest(seg, pos);
    const len = hypot(c.dx, c.dy) || 1;
    const u = { x: c.dx / len, y: c.dy / len };
    const dir = u.x * (goal.x - c.x) + u.y * (goal.y - c.y) >= 0 ? 1 : -1;
    const remain = dir > 0 ? (1 - c.t) * len : c.t * len;
    const goalDist = hypot(goal.x - c.x, goal.y - c.y);
    const limit = hop || onThis ? goalDist : remain;
    const travel = Math.min(budget, Math.max(0, limit));
    if (travel < 0.05 && !onThis && !hop) return false;
    pos = { x: c.x + u.x * dir * travel, y: c.y + u.y * dir * travel };
    budget -= travel;
    shot.ux = u.x * dir;
    shot.uy = u.y * dir;
    if (onThis && hypot(pos.x - player.x, pos.y - player.y) <= 26) return false;
    const reached = hop && travel + 0.05 >= goalDist;
    if (!reached) break;
    pos = { x: hop.x, y: hop.y };
    seg = hop.seg;
    const landed = closest(seg, pos);
    pos = { x: landed.x, y: landed.y };
  }
  shot.x = pos.x;
  shot.y = pos.y;
  shot.line = lineOf(seg, pos);
  return true;
}

// The mite this sweep meets first. A bolt stops there instead of flying on.
function firstAlong(seg, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l2 = dx * dx + dy * dy;
  let best = null;
  for (const enemy of enemies) {
    if (!sharesLine(seg, enemy.line)) continue;
    const reach = SHOT_HIT + Math.max(0, (enemy.r || ENEMY_R) - ENEMY_R);
    let t = 0;
    if (l2 > 0.01) {
      t = ((enemy.x - from.x) * dx + (enemy.y - from.y) * dy) / l2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    if (hypot(enemy.x - px, enemy.y - py) > reach) continue;
    if (!best || t < best.t) best = { enemy, t };
  }
  return best;
}

function pickKind() {
  if (score < 500) return "mite";
  if (score < 1000) {
    const bruteChance = 0.12 + ((score - 500) / 500) * 0.13;
    return Math.random() < bruteChance ? "brute" : "mite";
  }
  const past = score - 1000;
  const miteChance = Math.max(0.02, 0.5 - past / 12000);
  const tankShare = Math.min(0.95, 0.45 + past / 12000);
  const roll = Math.random();
  if (roll < miteChance) return "mite";
  if (roll < miteChance + (1 - miteChance) * (1 - tankShare)) return "brute";
  return "tank";
}

function makeEnemy(kind, pick) {
  const spec = KINDS[kind];
  return {
    x: pick.x,
    y: pick.y,
    line: lineOf(pick.seg, pick),
    kind,
    hp: spec.hp,
    maxHp: spec.hp,
    r: spec.r,
    color: spec.color,
    bounty: spec.score,
    flash: 0,
    struck: false,
  };
}

// One, two, and three health each have their own sprite. A hurt enemy puts on the sprite for the health it has left. The boss keeps its own shape.
function wear(enemy) {
  if (enemy.kind === "boss") return;
  const kind = enemy.hp === 3 ? "tank" : enemy.hp === 2 ? "brute" : "mite";
  const spec = KINDS[kind];
  enemy.kind = kind;
  enemy.r = spec.r;
  enemy.color = spec.color;
}

// One hit. A dash and a bolt each remove a single health, then the bolt is gone.
function hurt(enemy) {
  enemy.hp -= 1;
  enemy.flash = 0.14;
  if (enemy.hp <= 0) {
    score += enemy.bounty;
    return true;
  }
  wear(enemy);
  return false;
}

function pickSpawnPoint(segs, crowd) {
  const points = [];
  for (const seg of segs) {
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    for (const t of [0.08, 0.35, 0.65, 0.92]) {
      const p = { x: seg.ax + dx * t, y: seg.ay + dy * t };
      points.push({
        x: p.x,
        y: p.y,
        seg,
        d: hypot(p.x - player.x, p.y - player.y),
      });
    }
  }
  if (points.length === 0) return null;
  // Anywhere on the ink outside the circle. The tallest stroke is not special.
  let pool = points.filter((p) => p.d >= SPAWN_GAP);
  if (pool.length === 0) {
    pool = points.filter((p) => p.d >= 90);
    if (pool.length === 0) return null;
    let farthest = 0;
    for (const p of pool) if (p.d > farthest) farthest = p.d;
    pool = pool.filter((p) => p.d >= farthest * 0.85);
  }
  const busy = (p) => enemies.some((e) => sharesLine(p.seg, e.line));
  const openLines = pool.filter((p) => !busy(p));
  const spread = openLines.length > 0 ? openLines : pool;
  const roomy = spread.filter(
    (p) => !enemies.some((e) => hypot(e.x - p.x, e.y - p.y) < crowd),
  );
  const open = roomy.length > 0 ? roomy : spread;
  return open[Math.floor(Math.random() * open.length)];
}

// A point of revealed ink away from the spark. Crowded spots are skipped first.
function pickGiftPoint(segs) {
  let far = null;
  for (let i = 0; i < 16; i++) {
    const seg = segs[Math.floor(Math.random() * segs.length)];
    const t = 0.1 + Math.random() * 0.8;
    const x = seg.ax + (seg.bx - seg.ax) * t;
    const y = seg.ay + (seg.by - seg.ay) * t;
    const d = hypot(x - player.x, y - player.y);
    if (d < 36) continue;
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len = hypot(dx, dy) || 1;
    const spot = { x, y, ux: dx / len, uy: dy / len, seg, d };
    const crowded = enemies.some((e) => hypot(e.x - x, e.y - y) < 24);
    const taken =
      (gift && hypot(gift.x - x, gift.y - y) < 40) ||
      (heart && hypot(heart.x - x, heart.y - y) < 40);
    if (taken) continue;
    if (!crowded && d >= 70) return spot;
    if (!far || d > far.d) far = spot;
  }
  return far;
}

// After 1000, a mint mark shows up on the ink. Riding over it pairs each bolt for 10 seconds.
function tendGift(segs, dt) {
  doubleT = Math.max(0, doubleT - dt);
  if (score < 1000 || segs.length === 0) return;
  if (gift) {
    if (!followInk(segs, gift)) {
      gift = null;
      giftIn = 2;
      return;
    }
    if (hypot(gift.x - player.x, gift.y - player.y) <= 22) {
      gift = null;
      doubleT = 10;
      giftIn = 12 + Math.random() * 8;
    }
    return;
  }
  giftIn -= dt;
  if (giftIn > 0) return;
  const pick = pickGiftPoint(segs);
  if (!pick) {
    giftIn = 1.5;
    return;
  }
  gift = markAt(pick);
}

// A green heart on the ink, and only while a life is missing.
function tendHeart(segs, dt) {
  if (lives >= MAX_LIVES) {
    heart = null;
    return;
  }
  if (segs.length === 0) return;
  if (heart) {
    if (!followInk(segs, heart)) {
      heart = null;
      heartIn = 2;
      return;
    }
    if (hypot(heart.x - player.x, heart.y - player.y) <= 22) {
      heart = null;
      heartIn = 12 + Math.random() * 8;
      if (lives < MAX_LIVES) {
        lives += 1;
        lifeNote = 1.4;
      }
    }
    return;
  }
  heartIn -= dt;
  if (heartIn > 0) return;
  const pick = pickGiftPoint(segs);
  if (!pick) {
    heartIn = 1.5;
    return;
  }
  heart = markAt(pick);
}

function followInk(segs, item) {
  const home = segmentOnLine(segs, item.line);
  if (!home) return false;
  const c = closest(home.seg, item);
  const u = unitOf(c);
  item.x = c.x;
  item.y = c.y;
  item.ux = u.x;
  item.uy = u.y;
  item.line = lineOf(home.seg, item);
  return true;
}

function markAt(pick) {
  return {
    x: pick.x,
    y: pick.y,
    ux: pick.ux,
    uy: pick.uy,
    line: lineOf(pick.seg, pick),
  };
}

function spawn(segs) {
  if (segs.length === 0 || miteCount() >= enemyCap()) return;
  const crowd = score >= 1000 ? 8 : 16;
  const waves = waveSize();
  for (let i = 0; i < waves; i++) {
    if (miteCount() >= enemyCap()) return;
    const pick = pickSpawnPoint(segs, crowd);
    if (!pick) return;
    enemies.push(makeEnemy(pickKind(), pick));
  }
}

function spawnBoss(segs) {
  if (segs.length === 0) return false;
  const pick = pickSpawnPoint(segs, 36);
  if (!pick) return false;
  enemies.push(makeEnemy("boss", pick));
  return true;
}

// One boss at each 1000 points. The next waits while one is already riding.
function queueBosses(segs) {
  const earned = Math.floor(score / 1000);
  while (bossMarks < earned) {
    bossMarks += 1;
    bossesDue += 1;
  }
  if (bossesDue <= 0) return;
  if (enemies.some((enemy) => enemy.kind === "boss")) return;
  if (spawnBoss(segs)) bossesDue -= 1;
}

// The revealed stroke still under an enemy, or null once that ink is gone.
function strokeUnder(segs, pos) {
  let best = null;
  for (const seg of segs) {
    const c = closest(seg, pos);
    if (c.dist > 3) continue;
    if (!best || c.dist < best.c.dist) best = { seg, c };
  }
  return best;
}

// Rewinding the drawing erases ink. An enemy left off the remaining lines is
// removed, with no points, instead of hanging where the stroke used to be.
function dropFallen(segs) {
  const kept = [];
  for (const enemy of enemies) {
    const under = strokeUnder(segs, enemy);
    if (!under) continue;
    enemy.x = under.c.x;
    enemy.y = under.c.y;
    if (!enemy.line || !segmentOnLine(segs, enemy.line)) {
      enemy.line = lineOf(under.seg, under.c);
    }
    kept.push(enemy);
  }
  enemies = kept;
}

function moveEnemies(segs, dt) {
  const base = 62 + Math.min(score, 400) * 0.09;
  const playerHome = currentSegment(segs, player);
  const route = playerHome ? routesToward(segs, playerHome.seg, playerHome.c) : null;
  for (const enemy of enemies) {
    enemy.flash = Math.max(0, (enemy.flash || 0) - dt);
    if (!enemy.line || segs.length === 0) continue;
    const home = segmentOnLine(segs, enemy.line);
    if (!home) continue;
    let seg = home.seg;
    let pos = { x: enemy.x, y: enemy.y };
    const pace = KINDS[enemy.kind] ? KINDS[enemy.kind].speed : 1;
    let budget = base * pace * dt;
    // Spend this frame's travel along the ink. Reaching a joint continues
    // on the next stroke from that same point, with no leap ahead.
    for (let guard = 0; guard < 6 && budget > 0.05; guard++) {
      const onThis = playerHome && seg === playerHome.seg;
      let goal = null;
      let hop = null;
      if (onThis) {
        const at = closest(seg, player);
        goal = { x: at.x, y: at.y };
      } else if (playerHome) {
        hop = route.get(seg) || null;
        if (hop) goal = { x: hop.x, y: hop.y };
        else {
          const da = hypot(seg.ax - player.x, seg.ay - player.y);
          const db = hypot(seg.bx - player.x, seg.by - player.y);
          goal = da < db ? { x: seg.ax, y: seg.ay } : { x: seg.bx, y: seg.by };
        }
      }
      if (!goal) break;
      const c = closest(seg, pos);
      const len = hypot(c.dx, c.dy) || 1;
      const u = { x: c.dx / len, y: c.dy / len };
      const dir = u.x * (goal.x - c.x) + u.y * (goal.y - c.y) >= 0 ? 1 : -1;
      const remain = dir > 0 ? (1 - c.t) * len : c.t * len;
      const goalDist = hypot(goal.x - c.x, goal.y - c.y);
      const limit = hop || onThis ? goalDist : remain;
      const travel = Math.min(budget, limit);
      pos = {
        x: c.x + u.x * dir * travel,
        y: c.y + u.y * dir * travel,
      };
      budget -= travel;
      const reachedJoint = hop && travel + 0.05 >= goalDist;
      if (!reachedJoint) break;
      pos = { x: hop.x, y: hop.y };
      const landed = closest(hop.seg, pos);
      pos = { x: landed.x, y: landed.y };
      seg = hop.seg;
    }
    enemy.x = pos.x;
    enemy.y = pos.y;
    enemy.line = lineOf(seg, pos);
  }
}

function collide(segs) {
  if (hop) return;
  const mine = currentSegment(segs, player);
  enemies = enemies.filter((enemy) => {
    if (over) return true;
    if (!mine) return true;
    const onInk =
      sharesLine(mine.seg, enemy.line) || closest(mine.seg, enemy).dist < 3;
    if (!onInk) return true;
    const reach = (dash > 0 ? DASH_HIT : HIT) + Math.max(0, (enemy.r || ENEMY_R) - ENEMY_R);
    const d = hypot(enemy.x - player.x, enemy.y - player.y);
    if (d > reach) return true;
    if (dash > 0) {
      if (enemy.struck) return true;
      enemy.struck = true;
      return !hurt(enemy);
    }
    if (invuln > 0) return true;
    lives -= 1;
    invuln = 2.15;
    if (lives <= 0) over = true;
    return true;
  });
}

function overText() {
  return `Game over  ·  Score ${score}  ·  space to ride again`;
}

const HIGH_KEY = "animator.highscores";
const HIGH_N = 5;
let board = readBoard();
let mapName = "";
let onHighs = null;
let scored = false;

function cleanScores(scores) {
  if (!Array.isArray(scores)) return [];
  return scores
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, HIGH_N);
}

function readBoard() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = JSON.parse(localStorage.getItem(HIGH_KEY) || "{}");
    if (!raw || Array.isArray(raw) || typeof raw !== "object") return {};
    const next = {};
    let changed = false;
    for (const [name, scores] of Object.entries(raw)) {
      const clean = cleanScores(scores);
      if (!Array.isArray(scores) || clean.length !== scores.length) changed = true;
      if (clean.length > 0) next[name] = clean;
      else changed = true;
    }
    if (changed) localStorage.setItem(HIGH_KEY, JSON.stringify(next));
    return next;
  } catch {
    return {};
  }
}

function writeBoard() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(HIGH_KEY, JSON.stringify(board));
  } catch {
    // The list still shows for this visit if storage is blocked.
  }
}

function scoresFor(name) {
  return cleanScores(board[name]);
}

function emitHighs(rank) {
  if (onHighs) onHighs(scoresFor(mapName).join(","), rank);
}

export function watchScores(callback) {
  onHighs = callback;
  emitHighs(-1);
}

// The open drawing. Its own five scores are what the corner box shows.
export function setScoreMap(name) {
  mapName = String(name || "");
  emitHighs(-1);
}

// Highest first. A tying score lands with the earlier ties and can replace
// the previous last place. Returns the new row, or -1 if it did not place.
function insertHigh(value) {
  if (!(value > 0) || !mapName) return -1;
  const next = scoresFor(mapName);
  if (next.length >= HIGH_N && value < next[next.length - 1]) return -1;
  let rank = 0;
  while (rank < next.length && next[rank] > value) rank += 1;
  next.splice(rank, 0, value);
  board[mapName] = next.slice(0, HIGH_N);
  if (rank >= board[mapName].length) return -1;
  writeBoard();
  return rank;
}

function finishRun() {
  if (scored) return;
  scored = true;
  const rank = insertHigh(score);
  if (rank >= 0) emitHighs(rank);
}

function winText() {
  const perk = perkName();
  const extra = perk ? `  ·  ${perk}` : "";
  return `You win  ·  Score ${score}${extra}  ·  space to keep riding`;
}

function report(text) {
  if (text === lastStatus || !onStatus) return;
  lastStatus = text;
  onStatus(text);
}

function step(ts) {
  if (!playing) return;
  if (paused) {
    lastTs = ts;
    report("Paused  ·  Esc to resume");
    draw();
    raf = requestAnimationFrame(step);
    return;
  }
  const dt = Math.min((ts - lastTs) / 1000, 0.05) * pace;
  lastTs = ts;
  auraT += dt;
  lifeNote = Math.max(0, lifeNote - dt);
  const segs = revealedSegments();
  dropFallen(segs);
  if (spaceEdge) {
    spaceEdge = false;
    if (over) reset();
    else if (celebrating) {
      celebrating = false;
      passedWin = true;
    } else if (dash <= 0 && dashCd <= 0 && !hop) startDash(segs);
  }
  dash = Math.max(0, dash - dt);
  if (dash <= 0) dashCd = Math.max(0, dashCd - dt);
  hopCd = Math.max(0, hopCd - dt);
  if (hopFx) {
    hopFx.life -= dt;
    if (hopFx.life <= 0) hopFx = null;
  }
  if (dash <= 0) {
    for (const enemy of enemies) enemy.struck = false;
  }
  invuln = Math.max(0, invuln - dt);
  if (!over && !celebrating) {
    const onInk = slide(segs, dt);
    moveEnemies(segs, dt);
    moveShots(segs, dt);
    collide(segs);
    if (!over && onInk) {
      scoreAcc += dt;
      while (scoreAcc >= 1) {
        score += 1;
        scoreAcc -= 1;
      }
    }
    if (!over) queueBosses(segs);
    if (!over) tendGift(segs, dt);
    if (!over) tendHeart(segs, dt);
    if (!over && !passedWin && score >= WIN) celebrating = true;
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawn(segs);
      spawnIn = spawnDelay();
    }
  }
  if (over) {
    finishRun();
    report(overText());
  } else if (celebrating) report(winText());
  else if (segs.length === 0) report("Waiting for ink");
  else if (lifeNote > 0) report(rideText("life up"));
  else if (dash > 0) report(rideText("dashing"));
  else if (invuln > 0) report(rideText("safe"));
  else report(rideText());
  draw();
  raf = requestAnimationFrame(step);
}

function draw() {
  const anim = document.getElementById("animation-canvas");
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;
  if (anim && (canvas.width !== anim.width || canvas.height !== anim.height)) {
    canvas.width = anim.width;
    canvas.height = anim.height;
  }
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!playing || w === 0 || h === 0) return;
  ctx.setTransform(w / 1000, 0, 0, h / 1000, w / 2, h / 2);
  const ordered = enemies
    .filter((enemy) => enemy.kind !== "boss")
    .concat(enemies.filter((enemy) => enemy.kind === "boss"));
  for (const enemy of ordered) drawEnemy(ctx, enemy);
  for (const shot of shots) drawShot(ctx, shot);
  drawGift(ctx);
  drawHeart(ctx);
  drawHop(ctx);
  const blink = invuln > 0 && Math.floor(invuln * 12) % 2 === 0;
  if (!blink) {
    if (score >= 1000) drawAura(ctx);
    ctx.beginPath();
    ctx.arc(player.x, player.y, dash > 0 ? PLAYER_R + 4 : PLAYER_R, 0, Math.PI * 2);
    ctx.fillStyle = dash > 0 ? "#fff6d8" : "#ffe08a";
    ctx.fill();
  }
  drawBossBars(ctx, canvas);
}

function drawHop(ctx) {
  if (hopFx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, hopFx.life / 0.4) * 0.55;
    ctx.strokeStyle = "#fff6c8";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hopFx.x0, hopFx.y0);
    ctx.lineTo(hopFx.x1, hopFx.y1);
    ctx.stroke();
    ctx.restore();
  }
  if (!hop) return;
  const u = Math.min(1, hop.t / hop.dur);
  const e = u * u * (3 - 2 * u);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffe08a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hop.x0, hop.y0);
  ctx.lineTo(player.x, player.y);
  ctx.stroke();
  for (let i = 1; i <= 3; i++) {
    const g = Math.max(0, e - i * 0.1);
    ctx.globalAlpha = 0.45 - i * 0.1;
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath();
    ctx.arc(
      hop.x0 + (hop.x1 - hop.x0) * g,
      hop.y0 + (hop.y1 - hop.y0) * g,
      PLAYER_R - i * 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1 - e;
  ctx.strokeStyle = "#fff6c8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hop.x1, hop.y1, 8 + (1 - e) * 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1 - u;
  ctx.beginPath();
  ctx.arc(hop.x0, hop.y0, 6 + u * 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(ctx, enemy) {
  const r = enemy.r || ENEMY_R;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
  ctx.fillStyle = enemy.flash > 0 ? "#fff6f2" : enemy.color || "#ff5d7a";
  ctx.fill();
  if (enemy.kind === "boss") {
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#d8f6ff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawBossBars(ctx, canvas) {
  const bosses = enemies.filter((enemy) => enemy.kind === "boss");
  if (bosses.length === 0) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cssW = canvas.clientWidth || canvas.width;
  const scale = canvas.width / cssW;
  const barW = Math.min(360, cssW * 0.46) * scale;
  const barH = 11 * scale;
  const x = (canvas.width - barW) / 2;
  let y = 54 * scale;
  ctx.font = `${Math.round(13 * scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const boss of bosses) {
    ctx.fillStyle = "#e7f8ff";
    ctx.fillText(`Boss  ${boss.hp} / ${boss.maxHp}`, canvas.width / 2, y - 4 * scale);
    ctx.fillStyle = "rgba(8, 16, 28, 0.88)";
    ctx.fillRect(x, y, barW, barH);
    const frac = Math.max(0, boss.hp) / boss.maxHp;
    ctx.fillStyle = "#3ec6ff";
    ctx.fillRect(x, y, barW * frac, barH);
    y += barH + 22 * scale;
  }
}

function drawGift(ctx) {
  if (!gift) return;
  const pulse = 1 + Math.sin(auraT * 6) * 0.12;
  ctx.beginPath();
  ctx.arc(gift.x, gift.y, 13 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = "#14362c";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7dffe0";
  ctx.stroke();
  ctx.save();
  ctx.translate(gift.x, gift.y);
  ctx.rotate(Math.atan2(gift.uy || 0, gift.ux || 1));
  ctx.strokeStyle = "#e8fff6";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.lineTo(7, -4);
  ctx.moveTo(-6, 4);
  ctx.lineTo(7, 4);
  ctx.stroke();
  ctx.restore();
}

function drawHeart(ctx) {
  if (!heart) return;
  const pulse = 1 + Math.sin(auraT * 6 + 1.2) * 0.12;
  ctx.beginPath();
  ctx.arc(heart.x, heart.y, 13 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = "#1a2a18";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#9dff6a";
  ctx.stroke();
  ctx.save();
  ctx.translate(heart.x, heart.y);
  ctx.fillStyle = "#e7ffd4";
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-9, -1, -4, -8, 0, -3.5);
  ctx.bezierCurveTo(4, -8, 9, -1, 0, 5);
  ctx.fill();
  ctx.restore();
}

function drawShot(ctx, shot) {
  if (shot.disk) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.spin || 0);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = shot.phase === "back" ? "#9ad7ff" : "#e7fbff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#16304a";
    ctx.fill();
    ctx.restore();
    return;
  }
  // A vertical bolt has ux of 0. `||` would turn that into 1 and tilt the streak.
  const ux = shot.ux ?? 1;
  const uy = shot.uy ?? 0;
  ctx.beginPath();
  ctx.moveTo(shot.x - ux * 18, shot.y - uy * 18);
  ctx.lineTo(shot.x, shot.y);
  ctx.strokeStyle = "#ffe08a";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#fff6c8";
  ctx.fill();
}

function drawSpikes(ctx, rot, outer, inner, color) {
  ctx.save();
  ctx.rotate(rot);
  ctx.beginPath();
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + Math.PI / n;
    const r = i % 2 === 0 ? outer : outer * 0.7;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(b) * inner, Math.sin(b) * inner);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawAura(ctx) {
  const pulse = 1 + Math.sin(auraT * 9) * 0.1;
  ctx.save();
  ctx.translate(player.x, player.y);
  drawSpikes(ctx, auraT * 2.4, 36 * pulse, 16, "#ff9a2a");
  drawSpikes(ctx, -auraT * 3.2 + 0.5, 26 * pulse, 13, "#ffe56a");
  ctx.beginPath();
  ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 236, 170, 0.45)";
  ctx.fill();
  ctx.restore();
}

export function startRide(on_status) {
  listen();
  stopRide();
  playing = true;
  onStatus = on_status;
  lastStatus = "";
  reset();
  const segs = revealedSegments();
  if (segs.length > 0) placeOn(segs, { x: 0, y: 0 });
  const stage = document.getElementById("game-stage");
  if (stage) stage.focus();
  lastTs = performance.now();
  report(`Score 0  ·  Lives ${lives}`);
  raf = requestAnimationFrame(step);
}

export function setPaused(next) {
  if (!playing) return;
  const want = !!next;
  if (paused === want) return;
  paused = want;
  for (const key of Object.keys(held)) held[key] = false;
  stepWish = null;
  spaceEdge = false;
  if (paused) {
    savedRate = getSpeed();
    setSpeed(0);
    report("Paused  ·  Esc to resume");
  } else {
    setSpeed(savedRate);
    lastStatus = "";
  }
}

export function rememberSpeed(rate) {
  savedRate = rate;
}

export function setGamePace(next) {
  pace = next === 2 ? 2 : 1;
}

export function stopRide() {
  if (paused) {
    paused = false;
    setSpeed(savedRate);
  }
  playing = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  onStatus = null;
  for (const key of Object.keys(held)) held[key] = false;
  stepWish = null;
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

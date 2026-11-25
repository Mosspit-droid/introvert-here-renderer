// The stealth game as a small platformer (Barry, 21 Nov): old-handheld feel, two actions, one proper level.
//
// The hero is Hoodini. He is trying to get out of the office to the door at the far end. You cannot hurt anyone. Touching a person, or one
// of a talker's speech bubbles, is a conversation: it knocks a quarter off your social battery. Jump (A) over and around
// them. Hood Up (B): sit down, hood tight, and for a couple of seconds nobody notices you, but you cannot move.
// Steering is a thumb pad (gradual), with extra grip in the air. Low ceilings make Hood Up the only way through.
// Quiet rooms are checkpoints. Chasers run at you for a few seconds when you come near, then need a rest.
// Level 4 is the park: bouncy castles (hold A to go higher), balloons to fetch for three children, a slide,
// swings, a roundabout and a seesaw. No runners.
// Level 3 also has the crying corner: two friends who block the stairs until you bring them tissues from the kitchen.
// Level 3 adds dark rooms (a light switch toggles a room; in the dark nobody sees you) and a plate of food.
// Coffee: fast legs for six seconds. Phone: a fake call that lets one person or bubble go by for free.
// Tea tops the battery up; three "plans cancelled" notes are hidden for the thorough; headphones make you un-talk-to-able
// for a few seconds; office chairs bounce you. Fall down a gap and you lose a quarter and go back to the last safe spot.
//
// The hero, the people and the objects are Barry's flat "sticker" drawings (stealth-art/src/hero-*.png, flat-*.png).
// The floor, walls, windows and shelves are drawn in code. Wording is draft for Barry.
import { ART } from "./stealth-art/art.js";

const TITLE = "Hoodini: The OK Escape";   // working title
const HERO_NAME = "Hoodini";            // Barry's name for the introvert (21 Nov)

// The office: 250 squares long and 20 high (two storeys; the screen shows 11). Built from a list of placements so the
// rows cannot come out different lengths.
// # floor, wall or ceiling  F filing cabinet (solid)  = shelf or desk (jump up through it)  ^ office chair (bounces you)
// o tea  N plans-cancelled note  H headphones  c coffee (speed)  m phone call (one free pass)  K quiet room (checkpoint)  D the door out  S start
// P stander  W walker  T talker (speech bubbles)  C chaser (runs at you)  w where a walker turns round (invisible)
// Keys (Barry, 23 Nov): the thing to collect, about a hundred a level, and you need 40 of them to open the way out.
// They are scattered automatically over everywhere Hoodini can reach on foot (a rough model of his jump, chairs and
// bouncy castles), every third one up at jump height, and never on top of a person. Wide gaps only count as crossable when they are
// real drops (a pit, water), because each of those has a swing, a bus or balloons over it.
function keyed(map, n = 100, seeds = []) {
  const H = map.length, W = map[0].length, g = map.map((r) => r.replace(/o/g, ".").split(""));   // no more cups of tea: the keys top up the battery now (Barry, 23 Nov)
  const T = (x, y) => (y >= H ? "." : y < 0 || x < 0 || x >= W ? "#" : g[y][x]), sol = (c) => c === "#" || c === "F", floor = (c) => sol(c) || c === "=" || c === "B";
  const stand = (x, y) => y >= 1 && !sol(T(x, y)) && !sol(T(x, y - 1)) && floor(T(x, y + 1));
  const clearCol = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (sol(T(x, y))) return false; return true; };
  let start = null; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === "S") start = [x, y];
  const seen = new Set([start.join()]), q = [start]; seeds.forEach((sd) => { seen.add(sd.join()); q.push(sd); });
  while (q.length) { const [x, y] = q.shift(), maxUp = T(x, y) === "^" ? 6 : T(x, y + 1) === "B" ? 11 : 3;
    for (let dx = -14; dx <= 14; dx++) for (let up = maxUp; up >= -H; up--) { const nx = x + dx, ny = y - up; if (!stand(nx, ny) || seen.has(nx + "," + ny)) continue;
      if (Math.abs(dx) > 4) {   // long crossings only on the level or downwards, and only over a real drop (water, a pit): those all have a swing, a bus or balloons
        if (up > 0) continue; let pit = true;
        for (let xi = Math.min(x, nx) + 1; pit && xi < Math.max(x, nx); xi++) for (let yy = Math.min(y, ny); yy < H; yy++) if (floor(T(xi, yy))) { pit = false; break; }
        if (!pit) continue; }
      if (up > 1 && maxUp === 3 && Math.abs(dx) > 3) continue;
      const top = Math.min(y, ny) - 1; let ok = clearCol(x, top, y) && clearCol(nx, top, ny);
      for (let xi = Math.min(x, nx) + 1; ok && xi < Math.max(x, nx); xi++) ok = !sol(T(xi, top)) && !sol(T(xi, top + 1));
      if (ok) { seen.add(nx + "," + ny); q.push([nx, ny]); } } }
  let doorX = W; for (let y = 0; y < H; y++) { const d = g[y].indexOf("D"); if (d >= 0) doorX = Math.min(doorX, d); }   // nothing at or past the way out: touching it ends the level
  const busy = "PWTCGYJXQVMZARKDSh^g", cand = [...seen].map((k) => k.split(",").map(Number)).filter(([x, y]) => x >= 4 && x < doorX - 1 && g[y][x] === "." && ![-1, 0, 1].some((d) => busy.includes(T(x + d, y)))).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 0; i < Math.min(n, cand.length); i++) { let [x, y] = cand[Math.floor((i * cand.length) / Math.min(n, cand.length))];
    if (i % 3 === 2 && T(x, y - 1) === "." && T(x, y - 2) === "." && !sol(T(x, y - 3))) y -= 2;
    g[y][x] = "e"; }
  return g.map((r) => r.join(""));
}
function office() {
  const W = 250, H = 20, G = 17, U = 8, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  const pit = (x0, x1) => box(x0, x1, 18, 19, "."), hole = (x0, x1) => box(x0, x1, 9, 10, ".");
  box(0, W - 1, 18, 19, "#"); box(0, 0, 0, 19, "#"); box(W - 1, W - 1, 0, 19, "#");
  put(2, G, "S");
  // 1. A gentle start: tea, a desk, the first person to hop over, a gap, cabinets, a walker under a shelf (note 1)
  row(5, 7, G, "o"); row(9, 11, 16, "="); put(10, 15, "o"); put(14, G, "P");
  pit(18, 20); put(18, 15, "o"); put(19, 14, "o"); put(20, 15, "o");
  put(24, G, "F"); box(25, 26, 16, G, "F"); put(31, G, "W"); row(28, 32, 14, "="); put(30, 13, "N");
  // 2. An office chair up to a high shelf (tea, headphones), then a talker
  put(36, G, "^"); row(38, 43, 12, "="); row(39, 41, 11, "o"); put(43, 11, "H"); put(48, G, "T");
  // 3. Two low corridors where you cannot jump: Hood Up is the only way past the speech bubbles, then past a walker
  box(53, 60, 13, 15, "#"); row(55, 58, G, "o"); put(63, G, "T");
  box(67, 74, 13, 15, "#"); put(66, G, "w"); put(71, G, "W"); put(75, G, "w");
  put(77, G, "K");
  // 4. Up to the first floor: a staircase of cabinets with a chair on top
  put(79, G, "F"); box(80, 81, 16, G, "F"); box(82, 84, 15, G, "F"); put(84, 14, "^"); box(86, 150, 9, 10, "#");
  // 5. The first floor: holes to fall through, a chaser, a chair up to note 2, a talker. Below it, the all-hands meeting.
  row(89, 91, U, "o"); put(94, U, "W"); hole(98, 100); put(106, U, "C"); hole(112, 116); row(113, 114, 9, "=");
  put(118, U, "^"); row(120, 124, 5, "="); put(122, 4, "N"); row(120, 121, 4, "o"); put(128, U, "F"); put(132, U, "T");   // the cabinet stops his chatter reaching the foot of the ledge (Barry, 23 Nov)
  hole(134, 137); row(139, 141, U, "o"); put(144, U, "W");
  for (let x = 93; x <= 147; x += 6) put(x, G, "P");   // spaced so each can be hopped; the first floor is the easier way
  put(88, G, "m"); put(103, U, "c");
  put(153, G, "K");
  // 6. The canteen: tables, a talker, a chaser, a birthday huddle with a way over the top (note 3), a gap
  row(158, 160, 16, "="); row(158, 160, 15, "o"); put(163, G, "T"); row(165, 167, 16, "="); put(168, G, "c"); put(170, G, "m"); put(172, G, "C");
  row(175, 176, 15, "="); row(179, 183, 13, "="); put(182, 12, "N"); row(178, 180, G, "P"); pit(187, 189); put(188, 14, "o");
  // (The w at 227 keeps the last chaser back from where you land after the gap.)
  // 7. The way out: islands with a walker, a cabinet staircase, a leap over someone and a gap, a chaser, a talker, the door
  put(193, G, "K");
  pit(198, 200); pit(205, 208); row(206, 207, G, "=");   // the island between the gaps is empty: somewhere to land
  put(212, G, "F"); box(213, 213, 16, G, "F"); box(214, 215, 15, G, "F"); pit(221, 224); row(222, 223, 15, "="); row(222, 223, 14, "o");
  put(227, G, "w"); put(228, G, "c"); put(232, G, "C"); row(233, 235, G, "o"); put(238, G, "T"); put(244, G, "D");
  return g.map((r) => r.join(""));
}
// The office changes as you go. Each zone has its own wall colours and background furniture, and its name appears as
// you walk in. "up" is the first floor above the meeting room. tones = light, mid and dark for the faded furniture.
// kinds are Barry's background furniture (stealth-art/src/flat-decor.png), drawn faded: 0 desk 1 partition 2 bookshelf
//        3 photocopier 4 whiteboard 5 canteen table 6 vending machine 7 kitchen counter 8 fridge 9 lockers 10 water cooler
//        11 plant 12 sofa 13 reception desk
const ZONES = [
  { x0: 0, x1: 52, name: "Open Plan", wall: "#f3e3c0", dado: "#e7d2a6", rail: "#c9ad7a", tones: ["#e6d4a8", "#dcc893", "#d2bc84"], kinds: [0, 1, 2, 3, 11, 0], win: true },
  { x0: 52, x1: 86, name: "The Back Corridor", wall: "#e6e2d6", dado: "#d3cdbd", rail: "#b3ac98", tones: ["#d9d4c5", "#cbc5b3", "#bdb6a2"], kinds: [9, 10, 9, 11], win: false },
  { x0: 86, x1: 152, name: "The All-Hands Meeting", wall: "#efe0d8", dado: "#e2cbbf", rail: "#c2a595", tones: ["#e3cfc4", "#d6bdb0", "#c9ac9d"], kinds: [4, 11, 2, 4], win: false },
  { x0: 152, x1: 192, name: "The Canteen", wall: "#fbe9cf", dado: "#f3d2a4", rail: "#d6a868", tones: ["#f1d8ae", "#e8c88f", "#ddb873"], kinds: [5, 6, 7, 8, 5, 11], win: true },
  { x0: 192, x1: 250, name: "Reception", wall: "#e2efe6", dado: "#c8dfd0", rail: "#9fc2ac", tones: ["#d3e5d9", "#c0d8c8", "#acc9b6"], kinds: [12, 11, 13, 10, 12], win: true },
];
const UPSTAIRS = { x0: 86, x1: 152, name: "Management", wall: "#e4eaf2", dado: "#cdd8e6", rail: "#a3b4cb", tones: ["#d5deea", "#c3cfe0", "#b0bfd4"], kinds: [0, 2, 4, 11, 1], win: true };
const LEVEL = { name: "The Office", out: "the office", theme: "office", lost: "His spirit has been crushed. By middle management.", intro: "This is Hoodini. He’s had a long day at work. A gossiping rabble stands between him and the exit. He cannot let them stop him. Not when his very freedom is at stake. And his sanity.", need: 40, map: keyed(office()), zones: ZONES, upstairs: UPSTAIRS, signs: [{ x: 50.6, y: 14.2, t: "LOW CEILING" }, { x: 50.6, y: 14.9, t: "HOLD B: HOOD UP" }, { x: 76.6, y: 13.6, t: "UPSTAIRS IS QUIETER" }, { x: 89.5, y: 13.2, t: "ALL-HANDS MEETING" }],
  lines: { P: ["Have you got a sec?", "You’ll like this one.", "Are you coming to the thing?"], W: ["Ooh, just the person!", "Walk with me.", "Quick question."], T: ["How ARE you?", "Any plans for the weekend?", "Did you get my email?"], C: ["Come here, you!", "There you are!", "Don’t you run off!"], pit: ["You fell into a team-building exercise."] } };
// Level 2, the high street: outdoors, one storey plus rooftops. Same letters as the office, plus:
// G a dog on a lead (low: hop it)  u umbrella (hold jump in the air to float)   In the street, F is a crate, ^ a shop
// awning (bounces), K a phone box (checkpoint) and D the park gate. The bus and the cycle lanes are listed, not drawn in.
function highStreet() {
  const W = 232, H = 20, G = 17, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  const pit = (x0, x1) => box(x0, x1, 18, 19, ".");
  box(0, W - 1, 18, 19, "#"); box(0, 0, 0, 19, "#"); box(W - 1, W - 1, 0, 19, "#");
  put(2, G, "S");
  // 1. The bus stop: a charity collector pacing, a crate, a neighbour with a dog, a phone box, then the road (ride the bus)
  row(5, 7, G, "o"); put(9, G, "w"); put(12, G, "W"); put(16, G, "w"); put(19, G, "F"); put(19, 16, "o");
  put(23, G, "P"); put(24, G, "G"); put(30, G, "K"); pit(34, 45); row(38, 41, 13, "o");
  // 2. The market: stall roofs, a busker, an awning up to a note, an old school friend, a cycle lane, then headphones
  //    and a hen party too tightly packed to hop
  put(48, G, "K"); row(52, 55, 15, "="); row(53, 54, 14, "o"); put(58, G, "T"); put(62, G, "^"); row(64, 68, 12, "="); put(66, 11, "N"); row(64, 65, 11, "o");
  put(67, G, "w"); put(69, G, "c"); put(73, G, "C"); row(79, 81, 15, "o"); put(87, G, "H"); row(90, 97, G, "P");
  // 3. The arcade: a low roof with a busker beyond it (Hood Up), a walker, a gap with a note above it
  put(101, G, "K"); box(105, 113, 13, 15, "#"); row(107, 110, G, "o"); put(116, G, "T"); put(119, G, "w"); put(123, G, "W"); put(127, G, "w");
  pit(129, 131); put(132, G, "F"); row(133, 135, 14, "="); put(134, 13, "N"); put(137, G, "m");
  // 4. The rooftops: an awning up, an umbrella, and three alleys to float across. Each alley has a way back up.
  put(140, G, "K"); put(143, G, "^"); box(145, 151, 13, G, "#"); put(148, 12, "u");
  put(154, G, "P"); put(156, G, "^"); row(154, 155, 9, "o"); box(158, 164, 13, G, "#");
  put(167, G, "P"); put(169, G, "P"); put(171, G, "^"); row(167, 169, 9, "o"); box(172, 178, 13, G, "#"); put(175, 12, "K");
  put(181, G, "T"); put(184, G, "^"); put(182, 8, "N"); box(185, 191, 13, G, "#"); row(187, 189, 12, "o");
  // 5. The park gate: a cycle lane, a busker, the gate
  put(205, G, "c"); row(214, 216, G, "o");   // no old friend here any more: a cyclist, a runner and a busker at once was impossible (Barry, 24 Nov)
  put(219, G, "T"); put(226, G, "D");
  return g.map((r) => r.join(""));
}
const STREET_ZONES = [
  { x0: 0, x1: 46, name: "The Bus Stop", wall: "#bfe6f7", dado: "#e9c9a8", rail: "#b98f66", tones: ["#f3ddc4", "#d9b089", "#b98f66"], kinds: [], win: false },
  { x0: 46, x1: 100, name: "The Market", wall: "#bfe6f7", dado: "#f0d58a", rail: "#c9a03f", tones: ["#f8e8b4", "#e2c15f", "#c9a03f"], kinds: [], win: false },
  { x0: 100, x1: 139, name: "The Arcade", wall: "#bfe6f7", dado: "#d7c3e6", rail: "#9f84b8", tones: ["#e7daf1", "#c2a8d8", "#9f84b8"], kinds: [], win: false },
  { x0: 139, x1: 193, name: "The Rooftops", wall: "#a9d8f2", dado: "#d9a08a", rail: "#a8674f", tones: ["#ecc4b3", "#cf8f77", "#a8674f"], kinds: [], win: false },
  { x0: 193, x1: 232, name: "The Park Gate", wall: "#bfe6f7", dado: "#b9dba6", rail: "#6fa55a", tones: ["#d6ebc8", "#9fcb87", "#6fa55a"], kinds: [], win: false },
];
// rain: showers that come and go. In the rain the dog walker, the hen party and the clipboard walker put umbrellas up: the ones
// standing still cannot see you at all, and the walker only catches you if he walks into you. The busker, the runner and the cyclist carry on as normal. The pavement is slippery (Barry, 24 Nov).
const STREET = { rain: true, name: "The High Street", out: "the high street", theme: "street", lost: "The high street has claimed another.", talkEvery: 1.8, chaseSpeed: 4.0, walkSpeed: 2.4, need: 40, map: keyed(highStreet()), zones: STREET_ZONES, upstairs: null,
  intro: "Hoodini is out of the office. Home is at the far end of the high street. So is everyone he has ever met.",
  signs: [{ x: 33, y: 13.2, t: "WAIT FOR THE BUS" }, { x: 33, y: 13.9, t: "RIDE ON THE ROOF" }, { x: 86.5, y: 14.2, t: "HEADPHONES ON" }, { x: 102.6, y: 14.2, t: "HOOD UP" }, { x: 148, y: 10.6, t: "HOLD A IN THE AIR TO FLOAT" }],
  movers: [{ x0: 36.3, x1: 43.7, y: 16.12, w: 4.4, speed: 2.4 }],
  lanes: [{ x0: 76, x1: 85, every: 4.2 }, { x0: 195, x1: 203, every: 3.6 }],
  lines: { P: ["Is it? It IS you!", "Fancy seeing you here.", "You haven’t changed a bit."], W: ["Have you got two minutes for the donkeys?", "Just a quick survey.", "Can I stop you there?"], T: ["Any requests?", "This next one’s my own.", "Sing along!"], C: ["It’s ME! From SCHOOL!", "We MUST catch up!", "Come here, stranger!"], G: ["He’s just being friendly!", "He likes you!"], bike: ["On your LEFT!", "Ding ding!"], pit: ["You stepped into the road. The driver wanted a word."] } };

// Level 3, the house party: a three-storey house you zigzag up through. Along the hallway, up the stairs, back along
// the living room, up to the loft, along it and out of the loft window into the garden. 29 squares high.
// New here: L a light switch (dark rooms hide you, but you cannot see the floor),  f a plate of food (standing people
// ignore you while you carry it; anyone moving knocks it out of your hands).
// In the dark nobody sees you, the host included. A fall of more than 12 squares is the end
// of you unless you float down on the umbrella or land on the trampoline.
// The art is Barry's (stealth-art/src/party-*.png); the man with the guitar is the busker from the high street.
function houseParty() {
  const W = 120, H = 29, G = 26, F1 = 17, F2 = 8, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  box(0, W - 1, 27, 28, "#"); box(0, 0, 0, 28, "#"); box(W - 1, W - 1, 0, 28, "#");
  // The house: roof, outer walls (front door at the bottom left, loft window at the top right), and two upper floors
  row(15, 93, 0, "#"); box(15, 15, 0, 24, "#"); box(93, 93, 0, 26, "#"); row(93, 93, 7, "."); row(93, 93, 8, ".");
  box(16, 92, 18, 19, "#"); box(45, 61, 18, 19, "."); box(16, 92, 9, 10, "#"); box(18, 27, 9, 10, ".");
  put(2, G, "S");
  // Outside the front door: tea, and someone having a breather on the path
  row(5, 7, G, "o"); put(10, G, "P");
  // The hallway: an arguing couple who both shout at you, the cupboard under the stairs, then the stairs
  put(22, G, "T"); put(26, G, "w"); put(27, G, "c"); put(29, G, "h"); put(31, G, "C"); put(35, G, "w"); put(38, G, "T"); put(40, G, "h"); put(43, G, "K");
  row(46, 48, 25, "="); row(50, 56, 23, "="); put(53, 22, "Y"); put(54, 22, "Y"); row(58, 60, 21, "=");
  // The crying corner (Y Y) sits on the long stair and will not let you by without the box of tissues (t) from the back
  // of the kitchen. So the kitchen is no longer optional.
  // The kitchen, on past the foot of the stairs: a plate (standing people let you through while you carry it),
  // the huddle that never leaves, a note. The plate gets you back out too, and past the oversharer on the stairs.
  put(61, G, "f"); put(64, G, "P"); row(67, 72, G, "P"); put(75, G, "w"); put(78, G, "N"); row(80, 82, G, "o"); put(83, G, "A"); put(86, G, "t"); put(91, G, "w");
  // First floor, right-hand side (optional): the coat bedroom, dark, with a bed to bounce on
  put(64, F1, "L"); put(68, F1, "K"); put(80, F1, "^"); put(82, 12, "N"); row(84, 86, F1, "o");
  // Stepping stones back across the stairwell, heading left
  row(56, 57, 18, "="); row(51, 52, 18, "="); row(46, 47, 18, "="); put(51, 16, "o");
  // The living room: the dancing circle, then the sofa and two shelves up into the loft
  put(42, F1, "w"); put(37, F1, "W"); put(29, F1, "W"); put(23, F1, "w"); put(19, F1, "^"); row(21, 22, 13, "="); row(24, 25, 11, "=");
  // The loft, dark: a light switch, a low beam with the guitar man beyond it, two holes in the floor, a walker, the host
  put(30, F2, "L"); row(32, 34, F2, "o"); box(40, 48, 5, 6, "#"); put(52, F2, "T"); box(58, 60, 9, 10, "."); put(63, F2, "w"); put(66, F2, "W"); put(69, F2, "w");
  box(71, 73, 9, 10, "."); put(76, F2, "K"); put(79, F2, "w"); put(80, F2, "c"); put(82, F2, "h"); put(85, F2, "C"); put(88, F2, "h"); put(66, 6, "N"); put(90, F2, "u");
  // The garden: down from the loft window, a trampoline, the smokers, the back gate
  put(96, 11, "o"); put(99, 13, "o"); put(102, 15, "o"); put(99, 17, "o"); put(96, 19, "o"); put(99, 21, "o"); put(102, 23, "o");
  put(98, G, "^"); put(103, G, "w"); put(105, G, "P"); put(106, G, "P"); put(109, G, "C"); put(111, G, "h"); put(114, G, "D");
  return g.map((r) => r.join(""));
}
const NIGHT = { wall: "#2b3555", dado: "#232b47", rail: "#1b2238", kinds: [], out: true };
const PARTY_ZONES = [
  { ...NIGHT, x0: 0, x1: 15, y0: 0, y1: 27, name: "The Front Door" },
  { x0: 15, x1: 58, y0: 20, y1: 27, name: "The Hallway", wall: "#f1dcc3", dado: "#dcb48c", rail: "#b98a5a", kinds: [0, 1, 2, 1] },
  { x0: 58, x1: 94, y0: 20, y1: 27, name: "The Kitchen", wall: "#e3eedf", dado: "#bcd5b4", rail: "#8fb184", kinds: [5, 6, 8, 7, 5] },
  { x0: 45, x1: 62, y0: 11, y1: 20, name: "The Stairs", wall: "#f1dcc3", dado: "#dcb48c", rail: "#b98a5a", kinds: [] },
  { x0: 62, x1: 94, y0: 11, y1: 18, name: "The Coat Bedroom", wall: "#e6dcef", dado: "#c9b6dc", rail: "#9f84b8", kinds: [0, 1], dark: true },
  { x0: 15, x1: 45, y0: 11, y1: 18, name: "The Living Room", wall: "#fbe1cf", dado: "#f0b99a", rail: "#cf8a66", kinds: [3, 4, 2, 3] },
  { x0: 15, x1: 94, y0: 0, y1: 9, name: "The Loft", wall: "#d9cdb8", dado: "#bfae90", rail: "#96855f", kinds: [9, 10, 11, 9], dark: true },
  { ...NIGHT, x0: 94, x1: 120, y0: 0, y1: 27, name: "The Garden", kinds: [12, 14, 13] },
];
const PARTY = { name: "The House Party", out: "the house party", theme: "party", toll: { item: "BOX OF TISSUES", got: "Somebody on the stairs needs these.", name: "THE CRYING CORNER", block: "They will not let you past without a box of tissues. Try the kitchen.", done: "TISSUES DELIVERED", doneB: "They are hugging it out. On you go." }, lost: "The party has broken him.", talkEvery: 1.6, chaseSpeed: 3.4, chaseWind: 1, chaseRun: 3.2, chaseRest: 3.2, chaseCall: "THERE he is!", reach: true, walkSpeed: 2.6, fallMax: 12, need: 40, map: keyed(houseParty()), zones: PARTY_ZONES, upstairs: null,
  intro: "Hoodini cut through the park and found himself at a party he had said he was definitely coming to. The only way home is through the house.",
  signs: [{ x: 47, y: 21.4, t: "UP THE STAIRS" }, { x: 63.6, y: 23.6, t: "KITCHEN" }, { x: 86.5, y: 23.6, t: "TISSUES" }, { x: 20.5, y: 12.3, t: "SOFA: UP TO THE LOFT" }, { x: 88.5, y: 4.6, t: "TAKE THE UMBRELLA" }, { x: 88.5, y: 5.3, t: "IT IS A LONG WAY DOWN" }],
  lines: { P: ["There you are!", "Have you met everyone?", "We were JUST talking about you."], W: ["Come and dance!", "Get in the circle!", "One more song!"], T: ["Tell him!", "Tell HER!", "You’re on my side, aren’t you?"], C: ["You MADE it!", "You’re not LEAVING?", "Stay for the speeches!", "There’s cake at midnight!"], shield: ["Sorry, just taking this through."], A: ["CONGA!", "Get on the end!", "Da da da da da, HEY!"], reach: ["Have a drink!", "Try this, it’s lethal.", "Hold this a sec."], bite: ["Ooh, is that a sausage roll?", "Don’t mind if I do.", "Are those the mini quiches?"], Y: ["He said he needed SPACE.", "You’re a good listener, aren’t you?", "Sit down. It’s a long story.", "You’re so much better than him. I KNOW."], Yok: ["Thank you. You’re SO lovely."], pit: ["You fell into a conversation about house prices."] } };

// Level 5, the supermarket (Barry, 25 Nov, second go). Five aisles on ONE floor, drawn front to back: you see your own aisle and
// the one behind it. Change aisle with the stick (up = further back, down = towards the front) at the open end of the shelving or at
// a gap in it (links, below). The open ends alternate, so you zig-zag; one thing off the shopping list (g) is in each aisle, and the
// self-service checkout will not serve you without all five. The back aisle runs straight into a one-way queue lane that comes forward to the tills.
// R shoppers who nip round the ends too.  The lanes are rows of the map 7 apart (laneY is where feet stand).
function supermarket() {
  const W = 78, H = 41, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  box(0, W - 1, 39, 40, "#"); box(0, 0, 0, 40, "#"); box(W - 1, W - 1, 0, 40, "#"); [32, 25, 18, 11].forEach((y) => row(1, W - 2, y, "#"));
  const A = 38, B = 31, C = 24, D = 17, E = 10;   // the row people stand in, in aisles 1 (front) to 5 (back)
  box(55, 55, 12, 38, "#"); box(62, 62, 5, 31, "#");   // the queue lane is roped off from aisles 1 to 4; aisle 5 runs straight into it (Barry, 25 Nov: no doubling back)
  // Aisle 1, bread: in at the left, out at the right. Someone you know, a slow trolley.
  put(3, A, "S"); put(14, A, "P"); put(34, A, "R"); put(46, A, "g");
  // Aisle 2, tins: in at the right, out at the left. Two trolleys and an old school friend.
  put(52, B, "K"); put(44, B, "R"); put(33, B, "w"); put(26, B, "C"); put(18, B, "w"); put(12, B, "R"); put(9, B, "g");
  // Aisle 3, eggs: in at the left, out at the right. Free samples, headphones, the reduced-section scrum, the eggs beyond it.
  put(4, C, "K"); put(11, C, "P"); put(22, C, "R"); put(27, C, "H"); row(31, 35, C, "P"); put(46, C, "g");
  // Aisle 4, coffee: in at the right, out at the left. Trolleys and another old friend.
  put(52, D, "K"); put(44, D, "R"); put(40, D, "w"); put(28, D, "C"); put(20, D, "w"); put(14, D, "R"); put(9, D, "g");
  // Aisle 5, milk, at the back as always: in at the left, the milk near the far end, and straight on into the queue.
  put(4, E, "K"); put(12, E, "P"); put(24, E, "R"); put(38, E, "R"); put(48, E, "g");
  // The front of the shop: headphones where the queue lets you out, two chatty tills, then the self-service checkout
  put(58, A, "H"); put(65, A, "T"); put(69, A, "T"); put(74, A, "D");
  return g.map((r) => r.join(""));
}
const SZ = { wall: "#eef2f5", dado: "#eef2f5", rail: "#eef2f5", tones: ["#e3e9ee", "#d3dde4", "#c2cfd8"], kinds: [], win: false };
const SHOP_ZONES = [
  { ...SZ, x0: 0, x1: 78, y0: 33, y1: 39, name: "Aisle 1: Bread" }, { ...SZ, x0: 0, x1: 56, y0: 26, y1: 31, name: "Aisle 2: Tins" }, { ...SZ, x0: 0, x1: 56, y0: 19, y1: 24, name: "Aisle 3: The Reduced Section" },
  { ...SZ, x0: 0, x1: 56, y0: 12, y1: 17, name: "Aisle 4: Coffee" }, { ...SZ, x0: 0, x1: 56, y0: 0, y1: 10, name: "Aisle 5: Milk. Obviously." }, { ...SZ, x0: 56, x1: 78, y0: 0, y1: 31, name: "The Queue" },
];
const SHOP_LINKS = [{ a: 0, b: 1, x0: 49.5, x1: 54.9 }, { a: 1, b: 2, x0: 1, x1: 7.5 }, { a: 2, b: 3, x0: 49.5, x1: 54.9 }, { a: 3, b: 4, x0: 1, x1: 7.5 },
  { a: 0, b: 1, x0: 23, x1: 27, gap: true }, { a: 1, b: 2, x0: 37, x1: 41, gap: true }, { a: 2, b: 3, x0: 15, x1: 19, gap: true }, { a: 3, b: 4, x0: 33, x1: 37, gap: true },
  { a: 4, b: 3, x0: 56, x1: 61, down: true }, { a: 3, b: 2, x0: 56, x1: 61, down: true }, { a: 2, b: 1, x0: 56, x1: 61, down: true }, { a: 1, b: 0, x0: 56, x1: 61, down: true }];
const SHOP = { name: "The Supermarket", out: "the supermarket", theme: "shop", view: 13.6, laneY: [39, 32, 25, 18, 11], links: SHOP_LINKS, shelf: [1, 55], aisle: [9.5, 48], list: ["BREAD", "BEANS", "EGGS", "COFFEE", "MILK"],
  aisleSigns: [["BREAD", "CAKES", "JAM"], ["TINS", "BEANS", "PASTA SAUCE"], ["EGGS", "BISCUITS", "REDUCED"], ["COFFEE", "TEA", "CEREAL"], ["MILK", "CHEESE", "YOGHURT"]],
  seeds: [[3, 31], [3, 24], [3, 17], [3, 10], [59, 31], [59, 24], [59, 17], [59, 10]],
  lost: "Unexpected item in the bagging area.", talkEvery: 2.6, chaseSpeed: 3.4, chaseWind: 1, chaseRest: 3, walkSpeed: 2.2, reach: true, need: 40, zones: SHOP_ZONES, upstairs: null,
  intro: "Hoodini only needs five things: bread, beans, eggs, coffee and milk. One in each aisle, and the milk is at the back. Push the stick UP to go round into the next aisle, and look down it first.",
  signs: [{ x: 52, y: 34.3, t: "STICK UP: NEXT AISLE" }, { x: 25, y: 34.3, t: "GAP" }, { x: 39, y: 27.3, t: "GAP" }, { x: 33, y: 20.3, t: "REDUCED TO CLEAR" }, { x: 17, y: 20.3, t: "GAP" }, { x: 35, y: 13.3, t: "GAP" }, { x: 59.5, y: 6.4, t: "QUEUE HERE: STICK DOWN" }, { x: 74.5, y: 34.3, t: "SELF-SERVICE" }],
  props: [{ n: "selfcheck", x: 72.4 }, { n: "selfcheck", x: 76.4 }],
  chat: { P: ["They’ve moved the eggs AGAIN.", "I only came in for milk.", "Is that ALL you’re getting?", "Get the own-brand. Same factory.", "Meal deal? Living the dream.", "Don’t get the hummus. Trust me.", "I knew your mother. Lovely feet.", "Are you a big-shop or a little-shop person?", "Ooh, somebody’s having a quiet night in.", "That’s a LOT of cheese for one.", "They’ve got the yellow stickers out!", "Fancy seeing you in the bread aisle."],
    R: ["Beep beep, coming through.", "This trolley has a mind of its own.", "Have you SEEN the price of butter?", "Mind your ankles.", "I’ve been round three times for the stock cubes.", "Ooh, I’ll just nip round the end."], T: ["Next, please!", "Has anyone got a pound for the trolley?", "It’s not scanning. It never scans."], C: ["I’d know that hoodie anywhere.", "He was SO quiet at school."] },
  tannoy: ["Cleaner to aisle six. There is no aisle six.", "Would the owner of a navy hoodie please come to customer services.", "Shoppers are reminded that eye contact is optional.", "The reduced section is now open. Form an orderly scrum.", "Could the gentleman hiding behind the tins please stop."],
  lines: { P: ["Is that you? In HERE?", "Ooh, what are you having for tea?", "I never see you in here!"], R: ["Excuse me, do you work here?", "Can you reach the top shelf for me?", "Where do they keep the eggs?"], T: ["Do you need a bag?", "Have you got a loyalty card?", "Busy today, isn’t it?", "Doing anything nice later?"], C: ["It IS you! From SCHOOL!", "Hang on, I’ll walk round with you!", "Wait there, I’ll get my trolley!"], reach: ["Try the cheese!", "Free sample?", "It’s a new yoghurt!"], pit: ["You slipped."] } };
SHOP.map = keyed(supermarket(), 100, SHOP.seeds);

// A test, not a level (?aisles=1). Version 2 (Barry, 25 Nov): the aisles are on one floor, drawn front and back (the back one further
// away, not higher up). You change aisle by pushing the stick up or down at either end of the shelving, or at a gap in it. No ledges.
// Three shoppers (R) nip round the ends too. The question: is looking down an aisle and choosing which to take any fun?
function aisleTest() {
  const W = 60, H = 20, G = 17, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  box(0, W - 1, 18, 19, "#"); box(0, 0, 0, 19, "#"); box(W - 1, W - 1, 0, 19, "#"); row(1, W - 2, 11, "#");   // the back aisle's floor
  put(3, G, "S"); put(18, G, "R"); put(40, G, "P"); put(22, 10, "P"); put(34, 10, "R"); put(46, 10, "R"); put(56, 10, "D");
  return g.map((r) => r.join(""));
}
const AISLES = { name: "Aisle test", out: "the aisle test", theme: "shop", view: 13.6, laneY: [18, 11], links: [{ a: 0, b: 1, x0: 1, x1: 8 }, { a: 0, b: 1, x0: 52, x1: 59 }, { a: 0, b: 1, x0: 28.4, x1: 31.6, gap: true }], shelf: [8, 52], aisle: [9.5, 50.5], reach: true, lost: "Wrong aisle.", need: 0, map: keyed(aisleTest(), 20), zones: [{ x0: 0, x1: 60, name: "Two aisles", wall: "#eef2f5", dado: "#eef2f5", rail: "#eef2f5", tones: ["#e3e9ee", "#d3dde4", "#c2cfd8"], kinds: [], win: false }], upstairs: null,
  intro: "A test. The way out is at the far end of the BACK aisle. Push the stick UP or DOWN to change aisle: you can do it at either end of the shelves, or at the gap in the middle. The shoppers do it too.",
  signs: [{ x: 4, y: 13.4, t: "STICK UP: BACK AISLE" }, { x: 30, y: 13.4, t: "GAP" }, { x: 55.5, y: 7.4, t: "WAY OUT" }],
  chat: { R: ["They’ve moved the eggs AGAIN.", "I’ve been round three times for the stock cubes.", "Have you SEEN the price of butter?", "Ooh, I’ll just nip round the end."], P: ["That’s a LOT of cheese for one.", "Meal deal? Living the dream."] },
  lines: { R: ["Is that you? In HERE?", "Ooh, what are you having for tea?", "Mind your ankles."], P: ["I never see you in here!", "Is that ALL you’re getting?"], reach: ["Try the cheese!", "Free sample?"], pit: ["You fell."] } };

// Level 4, the family picnic in the park (Barry, 22 Nov). No runners. The heart of it: a child has lost their
// balloons above a bouncy castle. Bounce (hold A and each bounce goes higher), grab them, float down and hand them back.
// Three times, each harder. Between them, playground equipment: a slide, swings, a roundabout and a seesaw.
// V the uncle with the video camera (a beam that pans left and right)
// M the megaphone on the bandstand: it sweeps round like a searchlight; if it lands on you your name is called and the people nearby come over (Barry, 23 Nov)
// Z the aunt who wants a kiss (slow, but she keeps coming)
// B bouncy castle  a balloons  Q a child who has lost them (nobody gets past until they are returned)
// Balloons make you fall slowly, and holding A lets them lift you for a couple of seconds. High places are the quiet ones.
// The art is stand-in, borrowed from earlier levels or drawn in code.
function park() {
  const W = 232, H = 30, G = 27, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  const pit = (x0, x1) => box(x0, x1, 28, 29, ".");
  box(0, W - 1, 28, 29, "#"); box(0, 0, 0, 29, "#"); box(W - 1, W - 1, 0, 29, "#");
  put(2, G, "S");
  // 1. The picnic: the uncle with the joke, Gran wanting her tea (trampoline up to the flask), a baby for the picnic rug
  row(5, 7, G, "o"); put(13, G, "T"); put(19, G, "K"); put(22, G, "^"); row(23, 25, 22, "="); put(24, 21, "t"); put(28, G, "Y"); put(31, G, "b"); row(33, 36, G, "P"); put(39, G, "V");
  // 2. The playground: up the ladder and down the slide, swings over the sandpit, a roundabout that flings you over a crowd
  row(41, 42, 26, "="); row(41, 44, 24, "="); row(42, 43, 23, "o"); put(47, G, "P"); put(49, G, "P");
  pit(58, 70); row(62, 66, 22, "o"); row(74, 76, G, "="); row(79, 84, G, "P");
  // 3. The bouncy castle: balloons straight above it. Then a seesaw up to the treehouse.
  put(72, G, "Z"); put(91, G, "K"); row(97, 101, G, "B"); put(99, 18, "a"); row(103, 105, 21, "o"); put(111, G, "Q");
  row(119, 123, 19, "="); put(121, 18, "N"); row(119, 120, 18, "o");
  // 4. The pond: balloons that drift, and water to float across, with an island halfway
  put(126, G, "K"); row(128, 132, G, "B"); put(130, 17, "a"); pit(136, 144); row(145, 147, 23, "o"); put(146, 19, "N"); pit(148, 156); put(160, G, "Q");
  // 5. The bandstand: balloons high above the band, who are far too tall to climb past
  put(164, G, "K"); row(166, 170, G, "B"); put(168, 16, "a"); box(174, 186, 24, G, "#"); put(177, 23, "P"); put(180, 23, "M"); put(183, 23, "P"); put(189, G, "P"); put(181, 16, "N"); row(189, 191, 22, "o"); put(195, G, "Q");
  // 6. The park gate: one last swing over the flower bed, the uncle again, the gate
  put(200, G, "K"); pit(204, 211); put(217, G, "Z"); row(214, 216, G, "o"); put(219, G, "T"); put(226, G, "D");
  return g.map((r) => r.join(""));
}
const FAMILY_ZONES = [
  { x0: 0, x1: 38, name: "The Picnic", kinds: [0, 5, 8, 1] }, { x0: 38, x1: 90, name: "The Playground", kinds: [5, 1, 3, 7] }, { x0: 90, x1: 125, name: "The Bouncy Castle", kinds: [2, 5, 9, 6] },
  { x0: 125, x1: 163, name: "The Pond", kinds: [4, 5, 1, 4] }, { x0: 163, x1: 199, name: "The Bandstand", kinds: [7, 6, 1, 5] }, { x0: 199, x1: 232, name: "The Park Gate", kinds: [5, 7, 3, 6] },
];
const FAMILY = { name: "The Family Picnic", out: "the family picnic", theme: "family", lost: "The family has absorbed him.", talkEvery: 2, walkSpeed: 2.2, need: 40, map: keyed(park()), zones: FAMILY_ZONES, upstairs: null,
  intro: "Hoodini cut back through the park and straight into a family picnic he had forgotten about. A child has lost her balloons. Everyone is looking at him.",
  signs: [{ x: 24.5, y: 19.6, t: "TEA" }, { x: 42.5, y: 21.6, t: "SLIDE" }, { x: 75.5, y: 24.4, t: "ROUNDABOUT" }, { x: 99.5, y: 24.2, t: "HOLD A TO BOUNCE HIGHER" }, { x: 116.5, y: 24.6, t: "SEESAW" }, { x: 135, y: 21.4, t: "HOLD A: THE BALLOONS LIFT YOU" }, { x: 180, y: 14.2, t: "THE BANDSTAND" }],
  pram: { x: 37.6 }, sway: [0, 2.5, 2], tree: { x: 121.5, y: 19 }, stone: [174, 186, 24, 27], band: { x: 180.5, y: 24 }, ghost: [[41, 44, 24, 26, 1], [74, 76, 27, 27, 0], [119, 123, 19, 19, 0]], slides: [{ x0: 44.6, y0: 24, x1: 51, y1: 28 }], spins: [{ x: 75.5, y: 27 }], seesaws: [{ x: 116.5 }],
  movers: [{ sw: true, x: 61, y: 26.3, amp: 2.4, per: 3.6, ph: 0 }, { sw: true, x: 67, y: 26.3, amp: 2.4, per: 3.6, ph: 1.8 }, { sw: true, x: 207.5, y: 26.3, amp: 2.7, per: 3.6, ph: 0 }],
  toll: { item: "FLASK OF TEA", got: "Gran has been asking for one of these.", name: "GRAN", block: "She has hooked you with her stick. She wants a cup of tea first.", done: "TEA DELIVERED", doneB: "Gran is settled. On you go." },
  lines: { P: ["Still single, are you?", "When are you getting a proper job?", "You’ve lost weight. Or put it on.", "Are you still doing the computers?"], T: ["I’ve got a joke for you!", "Why did the chicken…", "Wait, you’ll like this one."],
    V: ["Say something for the video!", "Give us a wave! Go on!", "This is going on the family group."], M: ["HOODINI! COME AND SAY HELLO TO YOUR GRAN!", "IS THAT HOODINI? GIVE US A WAVE!", "EVERYONE! HOODINI’S HERE!"], Z: ["Come here, give us a kiss!", "Don’t be shy, come to your auntie!", "Ooh, haven’t you grown!"],
    Q: ["My balloons!", "They went UP!", "Get them! GET THEM!"], Qok: ["Isn’t he good with children?", "Are you thinking of having any yourself?", "You’re a natural!"],
    Y: ["Not so fast, young man.", "I’m parched, you know.", "Nobody has brought me a tea ALL DAY."], Yok: ["Oh, you ARE a good boy."], pit: ["You fell in. Everyone saw."] } };

// The arch nemesis: a colleague who turns up wherever Hoodini slips up, points and laughs. Stand-in art; the name is a draft.
const NEMESIS_NAME = "Gary from Sales";
// The end-of-level rating: [score out of 100 it starts at, grade, verdict]. Score = keys (60) + battery left (40). Drafts for Barry.
const GRADES = [[90, "A+", "Ghost. Nobody can confirm he was ever there."], [75, "A", "A clean exit. One witness, unreliable."], [55, "B", "Mildly traumatised. Recoverable with a quiet weekend."], [35, "C", "Socially sunburnt. Needs a lie down."], [0, "D", "Technically escaped. Spiritually still in there."]];
const FAILS = ["You have agreed to attend a barbecue.", "You are now on the social committee.", "You said “we must do this again”. You must now do this again.", "You have been added to a group chat."];

const CSS = `
body.stealth main{max-width:none;padding:0;margin:0}body.stealth footer{margin-top:0}
/* The game takes the whole screen: the site's header and footer are folded into the menu button (Barry, 24 Nov). */
header,footer{display:none!important}html,body{overflow:hidden;overscroll-behavior:none}
.pg{position:fixed;inset:0;z-index:6;overflow:hidden;background:#20222b;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none}
.pg [hidden]{display:none!important}
.pg canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.pg .card{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(22,20,18,.72);overflow:auto}
.pg .card>div{width:min(100%,600px);margin:auto;color:#f6efe0;box-shadow:0 14px 40px rgba(0,0,0,.6);--pad:14px}
.pg .card #pgend h2{font-size:22px;margin:1px 0 4px}.pg .card #pgend p{margin-bottom:6px}.pg .card #pgend .go{gap:9px;margin:8px 0 0}.pg .card #pgend .btn{padding:10px 14px;font-size:14px}.pg .card #pgend .lv{gap:6px}.pg .card #pgend .lv button{padding:7px 10px;font-size:12px}
.pg .card .sheet{width:100%;border-collapse:collapse;margin:0 0 8px;font-size:13px}.pg .card .sheet th{text-align:left;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b9ae9c;padding:4px 0;border-bottom:1px dashed #4a453c}.pg .card .sheet td{text-align:right;font-weight:800;color:#fad00c;padding:4px 0;border-bottom:1px dashed #4a453c;white-space:nowrap}
.pg .card .rate{display:flex;align-items:center;gap:12px;margin:0 0 4px;padding:6px 10px;border:2px solid #fad00c;border-radius:10px}.pg .card .rate b{flex:none;font:900 24px/1 Montserrat,sans-serif;color:#1c1611;background:#fad00c;border-radius:8px;padding:6px 9px;transform:rotate(-4deg)}.pg .card .rate span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b9ae9c;display:block}.pg .card .rate strong{display:block;font-size:14px;line-height:1.2;color:#f6efe0}
.pg .card .rate i{font-style:normal;color:#fad00c;letter-spacing:.1em;font-size:14px}
.pg .card .pre{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.pg .card h1,.pg .card h2{margin:2px 0 10px;font-size:26px;line-height:1.1;font-weight:800;text-wrap:balance}
.pg .card p{margin:0 0 10px;font-size:15px;line-height:1.45}.pg .card ul{margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.45}.pg .card li{margin-bottom:4px}
.pg .card .go{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:12px 0 0}.pg .card .btn{background:#fad00c;color:#1c1611}.pg .card a{color:#f6efe0;font-size:14px}
.pg .card .sm{font-size:13px;color:#b9ae9c;margin:0}
.pg .card .btn.alt{background:transparent;color:#fad00c;border:2px solid #fad00c;font-size:14px;padding:9px 14px}
.pg .pm{position:absolute;left:10px;top:10px;z-index:5;width:46px;height:46px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:12px;border:2px solid #fad00c;background:rgba(27,27,42,.85);cursor:pointer;padding:0}.pg .pm i{display:block;width:6px;height:18px;border-radius:2px;background:#fad00c}.pg .pm.mnu{left:118px;top:10px;margin:0;z-index:8;flex-direction:column;gap:4px}.pg .pm.mnu i{width:20px;height:4px}
.pg .nv{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;padding:10px;background:rgba(22,20,18,.86);overflow:auto}.pg .nv[hidden]{display:none}.pg .nv>div{width:min(100%,560px);margin:auto;--pad:12px;color:#f6efe0;text-align:center}.pg .nv img{display:block;width:min(70%,230px);height:auto;margin:0 auto 22px}
.pg .nv .big{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}.pg .nv .big a{flex:1 1 auto;display:block;padding:11px 10px;white-space:nowrap;border:2px solid #fad00c;border-radius:10px;color:#fad00c;font:800 15px/1 Montserrat,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none}.pg .nv .sml{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;margin:0 0 10px}.pg .nv .sml a{color:#b9ae9c;font-size:13px}.pg .nv .btn{background:#fad00c;color:#1c1611}
.pg .pm.snd{left:64px;color:#fad00c;font:800 24px/1 Montserrat,sans-serif}.pg .pm.snd.off{color:#6b6b78;text-decoration:line-through}
.pg .tp{position:absolute;inset:0;z-index:7;overflow:hidden;background:#fde8b3}.pg .tp[hidden]{display:none}
.pg .tp-art{position:absolute;inset:0;background:center bottom/100% auto no-repeat;animation:tpin .8s cubic-bezier(.2,1.4,.4,1) both,tpbreathe 7s .8s ease-in-out infinite alternate}
.pg .tp-logo{position:absolute;left:50%;top:1.2%;z-index:2;height:9.5%;transform:translateX(-50%);background:center/contain no-repeat}
.pg .tp-go{position:absolute;right:6%;top:22%;z-index:4;margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}.pg .tp .btn{font-size:24px;padding:14px 54px;background:#1b1b2a;color:#fad00c;border:4px solid #fad00c;box-shadow:0 6px 0 rgba(27,27,42,.45);animation:tppulse 1.6s ease-in-out infinite}.pg .tp a{color:#1b1b2a;font-size:14px;font-weight:700;background:rgba(253,233,182,.85);padding:2px 8px;border-radius:8px}
.pg .tp-g{position:absolute;right:-5%;bottom:-8%;z-index:3;height:min(72%,560px);aspect-ratio:800/730;pointer-events:none;transform:translate(125%,10%);animation:tpgary 9s 1.4s infinite}
.pg .tp-g b{position:absolute;inset:0;transform:scaleX(-1)}.pg .tp-g u{position:absolute;inset:0;transform-origin:50% 100%;animation:gyb .32s ease-in-out infinite alternate}.pg .tp-g i{position:absolute;background-repeat:no-repeat}
.pg .tp-g .gh,.pg .tp-g .gh2{z-index:2;transform-origin:47% 92%}.pg .tp-g .gh{animation:gyh .64s ease-in-out infinite alternate,gym2 1.28s steps(1) infinite}.pg .tp-g .gh2{opacity:0;animation:gyh .64s ease-in-out infinite alternate,gym 1.28s steps(1) infinite}
.pg .tp-g .gt{z-index:1}.pg .tp-g .gtf{z-index:3;clip-path:polygon(0.0% 0.0%,33.0% 0.0%,33.0% 10.8%,44.6% 15.7%,55.4% 16.5%,67.6% 14.9%,80.0% 11.4%,80.0% 0.0%,100.0% 0.0%,100.0% 100.0%,0.0% 100.0%)}.pg .tp-g .gp{z-index:0;transform-origin:13% 60%;animation:gyp .64s ease-in-out infinite alternate}.pg .tp-g .gf{z-index:4;transform-origin:34% 24%;animation:gyf .32s ease-in-out infinite alternate}
@keyframes gyb{to{transform:translateY(-1.6%)}}@keyframes gyh{from{transform:rotate(-3deg)}to{transform:rotate(5deg)}}@keyframes gym{0%{opacity:0}50%{opacity:1}}@keyframes gym2{0%{opacity:1}50%{opacity:0}}
@keyframes gyp{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}@keyframes gyf{from{transform:rotate(-2deg)}to{transform:rotate(3deg)}}
.pg .tp-g.gk{right:19%;bottom:-6%;height:min(42%,310px);z-index:4;visibility:hidden;animation:none;transform:translateY(112%)}.pg .tp-g.gk.on{visibility:visible;animation:gkin 2.3s cubic-bezier(.2,1.2,.4,1) both}
@keyframes gkin{0%{transform:translateY(112%)}11%,84%{transform:translateY(0)}100%{transform:translateY(112%)}}
@media (prefers-reduced-motion:reduce){.pg .tp-g.gk{transform:translateY(112%)!important}.pg .tp-g.gk.on{transform:none!important}}
.pg .tp.wait .tp-art,.pg .tp.wait .tp-g,.pg .tp.wait .btn{animation-play-state:paused}
@keyframes tpin{from{transform:scale(1.5) rotate(-5deg);opacity:0}}@keyframes tpbreathe{to{transform:scale(1.035) rotate(.5deg)}}@keyframes tppulse{50%{transform:scale(1.07)}}
@keyframes tpgary{0%,7%{transform:translate(125%,10%);animation-timing-function:cubic-bezier(.2,1.5,.4,1)}13%,45%{transform:translate(0,0);animation-timing-function:ease-in}50%,100%{transform:translate(125%,10%)}}
.pg .tp-art::before{content:"";position:absolute;left:0;right:0;bottom:calc(100vw / 2.3285 - 1.7vw);height:1.7vw;background:linear-gradient(#fde8b3,rgba(253,232,179,0))}
@media (min-aspect-ratio:21/10){.pg .tp-art{background-size:auto 100%;background-position:center bottom}.pg .tp-art::before{display:none}.pg .tp-logo{left:auto;right:1.5%;top:3%;height:17%;transform:none}.pg .tp-go{top:30%;right:3%}.pg .tp .btn{font-size:19px;padding:10px 34px}}
@media (max-aspect-ratio:13/10){.pg .tp-go{left:0;right:0;top:auto;bottom:14px}.pg .tp-art::before{display:none}.pg .tp-art{background-size:auto 62%;background-position:42% 60%}.pg .tp-logo{height:auto;width:70%}}
@media (prefers-reduced-motion:reduce){.pg .tp-art,.pg .tp .btn{animation:none}.pg .tp-g,.pg .tp-g u,.pg .tp-g i{animation:none!important}.pg .tp-g{transform:none}}
.pg .card .how{margin:0 0 4px}.pg .card .how summary{cursor:pointer;font-size:14px;font-weight:700;color:#fad00c;padding:6px 0;list-style-position:inside}.pg .card .how[open] summary{margin-bottom:6px}
.pg .card .lv{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.pg .card .lv button{font:700 13px/1 Montserrat,sans-serif;padding:9px 12px;border-radius:999px;border:2px solid #f6efe0;background:transparent;color:#f6efe0;cursor:pointer}.pg .card .lv button.on{background:#fad00c;border-color:#fad00c;color:#1c1611}.pg .card .lv button:disabled{opacity:.35;cursor:default}
@media (max-height:440px){.pg .card h1,.pg .card h2{font-size:20px}.pg .card ul{font-size:13px}.pg .card>div{width:min(100%,640px);--pad:10px}.pg .card .sheet th,.pg .card .sheet td{padding:3px 0}.pg .card p{font-size:13px;margin-bottom:6px}}
`;

// The game, run in the visitor's browser. Written without backticks or dollar-braces so it can sit in String.raw.
const CLIENT = String.raw`
(function(){
var LV=__LEVELS__,LI=0,L=LV[0],TH=null,NAME=__NAME__,ART=__ART__,HERO=ART.hero,FAILS=__FAILS__,GRADES=__GRADES__,NEM=__NEM__,SRC=__SRC__;
var $=function(i){return document.getElementById(i)},box=$('pg'),cv=$('pgc'),cx=cv.getContext('2d'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
var IMG={},waiting=0,ready=false;Object.keys(ART).forEach(function(n){waiting++;var im=new Image();im.onload=im.onerror=function(){if(--waiting<=0)ready=true};im.src=SRC+n;IMG[n]=im});var img=IMG.hero,PPT=ART['flat-things'].ppt;
var MAP=L.map,MW=MAP[0].length,MH=MAP.length,shop=false,street=false,party=false,family=false,office=true,lit={},VIEW=11,INK='#1b1b2a',YEL='#fad00c',CREAM='#f6efe0';
// Feel: squares per second. A full jump clears about 3.6 squares; letting go early cuts it short.
var RUN=5.6,ACC=46,AIR=78,JUMP=17,GRAV=42,FALLMAX=22,HOODMAX=2.4,HW=.3,HH=1.5;
function tile(x,y){return y<0?'.':y>=MH?'.':x<0||x>=MW?'#':MAP[y].charAt(x)}
function solid(x,y){var c=tile(x,y);return c==='#'||c==='F'}

var S,P,people,items,bubbles,says,movers=[],bikes=[],pops=[],T=0,keys={},btn={},stick=null,jumpQ=0,look=null,lookX=0,lookY=0,bcx=0,bcy=0;   // look = a finger dragging the picture to look around (the game waits)
// Which levels have been reached is remembered on this device.
function unlocked(){var n=0;try{n=parseInt(localStorage.getItem('ih_hoodini_level')||'0',10)||0}catch(e){}return Math.min(LV.length-1,Math.max(0,n))}
function unlock(i){try{if(i>unlocked())localStorage.setItem('ih_hoodini_level',String(i))}catch(e){}}
function load(i,quiet){LI=Math.max(0,Math.min(LV.length-1,i));if(!quiet)try{localStorage.setItem('ih_hoodini_last',String(LI))}catch(e){}L=LV[LI];MAP=L.map;MW=MAP[0].length;MH=MAP.length;street=L.theme==='street';
 party=L.theme==='party';family=L.theme==='family';shop=L.theme==='shop';office=!street&&!party&&!family;TH=family?{a:'#6fbf5a',b:'#4f9a43',c:'#8fd67a'}:street?{a:'#9aa4af',b:'#737d88',c:'#c5ccd4'}:party?{a:'#b98a5a',b:'#8f6741',c:'#d6ad7c'}:{a:'#3fa796',b:'#2e7f72',c:'#63c7b5'};lit={};VIEW=L.view||11;reset();menu();try{if(W)lay()}catch(e){}}
// The level picker, on the opening card and on the card at the end of a level. Levels you have reached can be picked.
function menu(){var un=unlocked();$('pgintrop').textContent=L.intro;[['pglv',false],['pglv2',true]].forEach(function(q){var el=$(q[0]);el.textContent='';if(LV.length<2||(q[1]&&un<1))return;
  LV.forEach(function(lv,i){var b=document.createElement('button');b.type='button';b.textContent=(i+1)+'. '+lv.name;b.className=i===LI?'on':'';b.disabled=i>un;b.addEventListener('click',function(){load(i);if(q[1]){$('pgcard').hidden=true;cv.focus()}});el.appendChild(b)})});
 $('pglvh').hidden=un<1}
function reset(){people=[];items=[];bubbles=[];says=[];pops=[];var sx=2,sy=8;
 movers=(L.movers||[]).map(function(m){return m.sw?{sw:true,cx:m.x,cy:m.y,amp:m.amp,per:m.per,ph:m.ph||0,w:2,x:m.x,y:m.y}:{x:m.x0,x0:m.x0,x1:m.x1,y:m.y,w:m.w,v:m.speed,wait:1,trolley:!!m.trolley}});bikes=(L.lanes||[]).map(function(l,i){return {x0:l.x0,x1:l.x1,every:l.every,t:i*1.3,x:null}});
 for(var y=0;y<MH;y++)for(var x=0;x<MW;x++){var c=MAP[y].charAt(x);
  if(c==='S'){sx=x;sy=y}else if(c==='a')items.push({k:'a',x:x+.5,x0:x+.5,y:y+.5,got:false,sway:(L.sway||[])[items.filter(function(q){return q.k==='a'}).length]||0})
  else if('PWTCGYJXQVMZAR'.indexOf(c)>=0)people.push({k:c,x:x+.5,home:x+.5,y:y+1,f:-1,t:Math.random()*2,i:people.length,run:0,rest:0})
  else if('oNHcmuftbeg'.indexOf(c)>=0)items.push({k:c,x:x+.5,y:y+.5,got:false})}
 var hen=0;people.forEach(function(p){if(p.k!=='P')return;var dogNear=people.some(function(o){return o.k==='G'&&Math.abs(o.x-p.x)<3.5});p.skin=street?(dogNear?0:4+(hen++%2)*2):[0,4,6][p.i%3];if(street&&dogNear){p.fixed=true;p.f=1}});
 people.forEach(function(p){if(p.k==='Y')p.fixed=true});
 items.filter(function(q){return q.k==='a'}).sort(function(m,n){return m.x-n.x}).forEach(function(q,i){q.sway=(L.sway||[])[i]||0});   // balloons are numbered left to right
 if(family)people.forEach(function(p){if(p.k==='P')p.skin=[4,6][p.i%2];if(p.k==='X')p.f=-1;if(p.k==='Q'||p.k==='V'||p.k==='M'||p.k==='Z')p.fixed=true});
 if(party){var st=0,tk=0;people.forEach(function(p){if(p.k==='P')p.skin=p.y<MH-2.5?4:[6,4][st++%2];if(p.k==='T'){var k2=tk++;p.sheet=k2<2?'party-people':'street-people';p.base=k2===0?0:2}})}
 P={x:sx+.5,y:sy+1,vx:0,vy:0,f:1,ground:true,coy:0,hood:false,hoodT:HOODMAX,cool:0,inv:0,phones:0,fast:0,shield:false,plate:false,tissues:false,baby:0,balloons:false,lift:2.5,bn:0,jT:9,jk:false,slide:null,fling:0,spinT:0,seeT:0,brolly:false,on:null,walkT:0,safe:[sx+.5,sy+1],wave:0};
 S={mode:'ready',batt:1,tea:0,notes:0,keys:0,keyT:items.filter(function(q){return q.k==='e'}).length,t:0,hits:0,cp:null,tries:0};keys={};btn={};stick=null;jumpQ=0;look=null;lookX=lookY=0}
// Battery flat with a quiet room behind you: carry on from there with a full battery (what you collected stays collected).
function again(){P.peak=null;if(!S.cp){reset();return}P.x=S.cp[0];P.y=S.cp[1];P.vx=P.vy=0;P.inv=1.5;P.hood=false;P.hoodT=HOODMAX;P.phones=0;P.safe=[P.x,P.y];S.batt=1;S.mode='play';S.tries++;bubbles=[];says=[];people.forEach(function(p){p.run=0;p.rest=1;p.follow=false})}
function flat(){sfx('lose');nemPic(null);S.mode='lost';card(NAME+' didn’t make it.',(S.why==='drop'?'It was a long way down. Next time, take the umbrella.':(L.lost||'His social battery is flat.')),S.cp?'Back to the last quiet room.':'Back to your desk. Nobody saw anything.','Try again')}
function info(a,b){S.info={a:a,b:b,t:4}}
function say(t,x,y){if(!t)return;for(var i=0;i<says.length;i++)if(says[i].t===t){says[i].life=2.2;says[i].x=x;says[i].y=y;return}says.push({t:t,x:x,y:y,life:2.2});if(says.length>4)says.shift()}
var AC=null,muted=false,fx=[];try{muted=localStorage.getItem('ih_hoodini_mute')==='1'}catch(e){}
function wake(){try{if(!AC){var A=window.AudioContext||window.webkitAudioContext;if(A)AC=new A()}if(AC&&AC.state==='suspended')AC.resume()}catch(e){}}
addEventListener('pointerdown',wake,true);addEventListener('keydown',wake,true);
function tone(f0,f1,d,type,vol,at){if(!AC||muted)return;try{var t=AC.currentTime+(at||0),o=AC.createOscillator(),g=AC.createGain();o.type=type||'square';o.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+d);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol||.12,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+d+.03)}catch(e){}}
function hiss(d,vol,freq,at){if(!AC||muted)return;try{var t=AC.currentTime+(at||0),n=Math.floor(AC.sampleRate*d),b=AC.createBuffer(1,n,AC.sampleRate),a=b.getChannelData(0),i;for(i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);var src=AC.createBufferSource(),g=AC.createGain(),fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=freq||900;src.buffer=b;g.gain.value=vol||.2;src.connect(fl);fl.connect(g);g.connect(AC.destination);src.start(t)}catch(e){}}
function sfx(n){if(!AC||muted)return;
 if(n==='jump')tone(330,660,.13,'square',.09);
 else if(n==='land')hiss(.09,.22,500);
 else if(n==='step')hiss(.03,.05,1400);
 else if(n==='tea'){tone(880,880,.07,'square',.08);tone(1320,1320,.12,'square',.08,.07)}
 else if(n==='power'){[523,659,784,1047].forEach(function(f,i){tone(f,f,.1,'square',.09,i*.07)})}
 else if(n==='hurt'){tone(300,90,.28,'sawtooth',.14);hiss(.12,.2,700)}
 else if(n==='laugh'){[620,520,620,520,440].forEach(function(f,i){tone(f,f*.82,.1,'square',.08,.3+i*.13)})}
 else if(n==='boing')tone(180,720,.22,'sine',.2);
 else if(n==='hood')hiss(.22,.12,420);
 else if(n==='quiet'){hiss(.05,.25,1800);hiss(.5,.1,260,.08);tone(196,147,.5,'sine',.1,.08)}
 else if(n==='key'){tone(1568,1568,.05,'square',.06);tone(2093,2093,.09,'square',.06,.05)}
 else if(n==='blip')tone(520,440,.06,'square',.04);
 else if(n==='win'){[523,659,784,659,784,1047].forEach(function(f,i){tone(f,f,i===5?.4:.12,'square',.1,i*.12)})}
 else if(n==='lose'){[440,370,311,233].forEach(function(f,i){tone(f,f*.97,i===3?.5:.2,'triangle',.16,i*.2)})}
 else if(n==='fall')tone(500,80,.4,'sine',.16)}
var RN=null;
function rainVol(v){if(!AC)return;try{if(!RN){var n=AC.sampleRate*2,b=AC.createBuffer(1,n,AC.sampleRate),a=b.getChannelData(0),i,l=0;for(i=0;i<n;i++){l=l*.6+(Math.random()*2-1)*.4;a[i]=l}var src=AC.createBufferSource(),hp=AC.createBiquadFilter(),lp=AC.createBiquadFilter();RN=AC.createGain();src.buffer=b;src.loop=true;hp.type='highpass';hp.frequency.value=700;lp.type='lowpass';lp.frequency.value=2600;RN.gain.value=0;src.connect(hp);hp.connect(lp);lp.connect(RN);RN.connect(AC.destination);src.start()}RN.gain.setTargetAtTime(muted?0:v*.022,AC.currentTime,.6)}catch(e){}}
function puff(x,y,n,sp){if(calm)return;for(var i=0;i<n;i++)fx.push({x:x+(Math.random()-.5)*.4,y:y-.05,vx:(Math.random()-.5)*(sp||2.4),vy:-Math.random()*1.1,life:.38,r:.1+Math.random()*.1})}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function laneLink(i,x,dir){var ls=L.links||[],n;for(n=0;n<ls.length;n++){var q=ls[n];if(x<q.x0||x>q.x1)continue;if(q.down){if(dir>0&&q.a===i)return q.b}else if(dir<0&&q.a===i)return q.b;else if(dir>0&&q.b===i)return q.a}return null}
function need(){return /[?&]nokeys=1/.test(location.search)?0:Math.min(L.need||0,S.keyT||0)}
function feed(p){people.forEach(function(o){if(o.k==='P'&&Math.abs(o.y-p.y)<.5&&Math.abs(o.x-p.x)<6.2)o.fed=true});P.plateN=(P.plateN||1)-1;pops.push({x:p.x,y:p.y-1.2,life:.6,big:true});say(pick((L.lines.bite)||['Ooh, lovely.']),p.x,p.y-2.6);if(P.plateN<=0){P.plate=false;info('THE PLATE IS EMPTY','They have eaten the lot. Anyone you fed will still let you past.')}}
function hurt(why,from){if(P.inv>0||S.mode!=='play')return;if(P.plate&&why==='P')return;if(P.plate&&why!=='fell'){P.plate=false;P.inv=1.3;pops.push({x:P.x,y:P.y-1,life:.6,big:true});say('Your plate!',P.x,P.y-2.7);info('YOU DROPPED THE PLATE','It only works on people standing still. That one was moving.');return}if(P.shield&&why!=='fell'){P.shield=false;P.inv=1.3;P.callT=1.3;say(L.lines.shield?L.lines.shield[0]:'Sorry, on a call.',P.x,P.y-2.7);pops.push({x:P.x,y:P.y-1,life:.6,big:true});info('THE PHONE CALL SAVED YOU','That was your free pass. It is used up now.');return}S.why=why;S.batt-=.25;S.hits++;S.gyAt=T;S.gyLv=Math.max(1,Math.round((1-S.batt)/.25));P.cringeT=.6;S.freeze=calm?0:.09;S.shake=.35;sfx('hurt');puff(P.x,P.y-.8,6,5);P.inv=1.6;P.hood=false;P.vy=-8;P.vx=(from!=null&&from>P.x?-1:1)*5;P.ground=false;
 if(S.batt<=.001)flat()}
function card(h,p,sm,b){$('pgsheet').hidden=true;$('pgch').textContent=h;$('pgcp').textContent=p;$('pgcs').textContent=sm;$('pgcb').textContent=b;$('pgintro').hidden=true;$('pgend').hidden=false;$('pgcard').hidden=false;menu();$('pgcb').focus()}
function win(){if(L.laneY&&!calm&&S.mode==='play'){S.mode='reveal';S.revT=0;sfx('win');return}if(S.mode!=='reveal')sfx('win');S.mode='won';P.wave=1;var more=LI<LV.length-1;if(more)unlock(LI+1);nemPic(null);
 var bp=Math.round(Math.max(0,S.batt)*100),kp2=S.keyT?S.keys/S.keyT:0,sc=Math.round(kp2*60+Math.max(0,S.batt)*40),g=GRADES.filter(function(q){return sc>=q[0]})[0],st=sc>=90?5:sc>=75?4:sc>=55?3:sc>=35?2:1;
 card(more?NAME+' made it out of '+L.out+'.':NAME+' is free at last.','','',more?'Next: '+LV[LI+1].name:'Play '+L.name+' again');
 var row=function(a,b){return '<tr><th>'+a+'</th><td>'+b+'</td></tr>'},mm=Math.floor(S.t/60),ss=Math.round(S.t%60);
 $('pgsheet').innerHTML='<table class="sheet">'+row('Social battery on leaving',bp+'%')+row('Keys',S.keys+' of '+S.keyT)+row('Conversations endured',S.hits)+row('Do Not Disturb signs',S.notes+' of 3')+row('Time',mm+':'+(ss<10?'0':'')+ss)+'</table><div class="rate"><b>'+g[1]+'</b><div><span>Rating <i>'+'★★★★★'.slice(0,st)+'<span style="display:inline;color:#4a453c;letter-spacing:.1em;font-size:14px">'+'★★★★★'.slice(st)+'</span></i></span><strong>'+g[2]+'</strong></div></div>';$('pgsheet').hidden=false}

// ---- one tick ----
// How hard you are steering, -1 to 1: keys are all or nothing, the thumb pad is gradual.
function steer(){var k=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);if(k)return k;if(!stick)return 0;var v=stick.v,m=Math.abs(v);return m<.18?0:(v>0?1:-1)*Math.min(1,.35+(m-.18)/.5*.65)}function hoodKey(){return keys.x||keys.Shift||keys.ArrowDown||keys.s||btn.b}function jumpKey(){return keys.z||keys[' ']||keys.ArrowUp||keys.w||btn.a}
function update(dt){if(S.mode!=='play'&&S.mode!=='ready')return;if(look)return;if(S.freeze>0){S.freeze-=dt;return}
 if(L.laneY){if(P.laneT>0)P.laneT-=dt;if(P.lo){var ls=dt*13;P.lo=Math.abs(P.lo)<=ls?0:P.lo-(P.lo>0?ls:-ls);P.walkT+=dt}var lv=(keys.i?-1:0)+(keys.k?1:0);if(!lv&&stick&&Math.abs(stick.vy||0)>.7&&Math.abs(stick.v)<.65)lv=stick.vy>0?1:-1;
  var li=P.ground?L.laneY.indexOf(Math.round(P.y*100)/100):-1,upL=li<0?null:laneLink(li,P.x,-1),dnL=li<0?null:laneLink(li,P.x,1);S.canUp=!!upL;S.canDn=!!dnL;
  if(lv&&li>=0&&!(P.laneT>0)&&S.mode==='play'){var to=lv<0?upL:dnL;if(to!=null){var ty=L.laneY[to];P.lo=P.y-ty;P.y=ty;P.vy=0;P.vx=0;P.laneT=1.1;P.safe=[P.x,P.y]}}if(P.lo){keys.ArrowLeft=keys.ArrowRight=keys.a=keys.d=0;P.vx=0}}
 movers.forEach(function(m){if(m.sw){var ox=m.x,sa=Math.sin((S.t+m.ph)*6.2832/m.per);m.x=m.cx+m.amp*sa;m.y=m.cy-Math.abs(sa)*.5;if(P.on===m){P.x+=m.x-ox;P.y=m.y}return}if(m.wait>0){m.wait-=dt;return}var dx=m.v*dt;m.x+=dx;if(P.on===m)P.x+=dx;if((m.v>0&&m.x>=m.x1)||(m.v<0&&m.x<=m.x0)){m.x=m.v>0?m.x1:m.x0;m.v=-m.v;m.wait=1.4}});P.on=null;
 var sv=steer(),d=sv>0?1:sv<0?-1:0;if(S.mode==='ready'&&(d||jumpQ>0||hoodKey()))S.mode='play';if(S.mode==='play')S.t+=dt;if(L.tannoy){S.tanT=(S.tanT==null?9:S.tanT)+dt;if(S.tanT>11){S.tanT=0;sfx('quiet');say('BING BONG. '+pick(L.tannoy),cam+vw/2,camY+2.2)}}if(L.rain){var rn=(S.t%50)>22;if(rn&&!S.raining){if(!S.seenR){S.seenR=true;info('IT’S RAINING','Anyone standing under an umbrella can’t see you. Walkers can still walk into you. The pavement is slippery.')}}S.raining=rn;S.wet=Math.max(0,Math.min(1,(S.wet||0)+(rn?dt:-dt)/1.5));}else S.wet=0;
 if(P.inv>0)P.inv-=dt;if(P.phones>0)P.phones-=dt;if(P.fast>0)P.fast-=dt;if(P.cool>0)P.cool-=dt;if(jumpQ>0)jumpQ-=dt;
 // Hood Up: on the ground, while B is held and there is hood left
 var want=hoodKey()&&P.ground&&P.cool<=0&&P.hoodT>0&&S.mode==='play';
 if(want){if(!P.hood)sfx('hood');P.hood=true;P.hoodT-=dt;if(P.hoodT<=0){P.hood=false;P.cool=1.5}}else{if(P.hood)P.cool=Math.max(P.cool,.4);P.hood=false;if(!hoodKey())P.hoodT=Math.min(HOODMAX,P.hoodT+dt*1.2)}
 if(P.hood)sv*=.27;if(P.ground&&sv===0&&Math.abs(P.vx)>4.5&&!(P.skidT>0))P.skidT=.3;if(P.skidT>0)P.skidT-=dt;if(P.callT>0)P.callT-=dt;if(P.cringeT>0)P.cringeT-=dt;if(P.wetT>0)P.wetT-=dt;P.hoodW=P.hood?(P.hoodW||0)+Math.abs(P.vx)*dt:0;
 // running
 if(jumpKey()&&!P.jk)P.jT=0;P.jk=!!jumpKey();P.jT+=dt;
 var tv=sv*RUN*(P.fast>0?1.45:1),ac=(P.ground?ACC*(S.wet>.5?.4:1):AIR)*dt;if(P.vx<tv)P.vx=Math.min(tv,P.vx+ac);else if(P.vx>tv)P.vx=Math.max(tv,P.vx-ac);if(P.fling>0){P.fling-=dt;P.vx=13;P.f=1}if(d)P.f=d;   // quicker to turn in the air than on the carpet
 // jumping, with a little forgiveness either side of an edge
 if(P.ground)P.coy=.1;else P.coy-=dt;
 if(jumpQ>0&&P.coy>0&&!P.hood){P.vy=-JUMP;P.ground=false;P.coy=0;jumpQ=0;P.sq=1;sfx('jump');puff(P.x,P.y,3)}
 if(P.vy>=0)P.sprung=false;if(!jumpKey()&&!P.sprung&&P.vy<-6)P.vy=-6;   // letting go of A cuts a jump short (but not a bounce)
 P.vy=Math.min(FALLMAX,P.vy+GRAV*dt);P.float=P.brolly&&!P.ground&&jumpKey()&&P.vy>0;if(P.float)P.vy=Math.min(P.vy,3.4);
 if(P.ground)P.lift=2.5;if(P.balloons&&!P.ground){if(jumpKey()&&P.lift>0&&P.vy>-2.6){P.vy=Math.max(-2.4,P.vy-70*dt);P.lift-=dt}else if(P.vy>2.6)P.vy=2.6}
 // move sideways, then up or down, stopping at anything solid
 var nx=P.x+P.vx*dt,top=P.y-HH,ys=[Math.floor(top+.05),Math.floor(P.y-HH/2),Math.floor(P.y-.05)],i;
 if(P.vx>0){for(i=0;i<3;i++)if(solid(Math.floor(nx+HW),ys[i])){nx=Math.floor(nx+HW)-HW-.001;P.vx=0;break}}
 else if(P.vx<0){for(i=0;i<3;i++)if(solid(Math.floor(nx-HW),ys[i])){nx=Math.floor(nx-HW)+1+HW+.001;P.vx=0;break}}
 P.x=nx;var ny=P.y+P.vy*dt,xa=Math.floor(P.x-HW+.02),xb=Math.floor(P.x+HW-.02),wasGround=P.ground;P.ground=false;
 if(P.vy>=0){for(i=xa;i<=xb;i++){var ty=Math.floor(ny),c=tile(i,ty);
   if((solid(i,ty)||(c==='='&&P.y<=ty+.02))&&P.y<=ty+.02+Math.max(0,P.vy*dt)){ny=ty;P.vy=0;P.ground=true;break}}}
 else{for(i=xa;i<=xb;i++)if(solid(i,Math.floor(ny-HH))){ny=Math.floor(ny-HH)+1+HH+.001;P.vy=0;break}}
 movers.forEach(function(m){if(P.vy>=0&&P.y<=m.y+.08&&ny>=m.y&&Math.abs(P.x-m.x)<m.w/2+.1){ny=m.y;P.vy=0;P.ground=true;P.on=m}});
 P.y=ny;if(P.float||P.peak==null)P.peak=P.y;if(!P.ground)P.peak=Math.min(P.peak,P.y);else{var drop=P.y-P.peak;P.peak=P.y;if(L.fallMax&&drop>L.fallMax&&S.mode==='play'){S.why='drop';S.hits++;S.batt=0;say('That was a long way down.',P.x,P.y-2.6);flat();return}}
 P.idleT=(S.mode==='play'&&P.ground&&Math.abs(P.vx)<.2&&!P.hood&&!jumpKey()&&!P.slide)?(P.idleT||0)+dt:0;
 if(P.ground&&Math.abs(P.vx)>.5)P.walkT+=dt;if(P.landT>0)P.landT-=dt;if(P.ground&&!wasGround&&P.fell>6)P.landT=.12;if(P.ground&&!wasGround&&P.fell>3){P.sq=-Math.min(1,P.fell/14);sfx('land');puff(P.x,P.y,P.fell>10?7:4,P.fell>10?4:2.4)}P.sq=(P.sq||0)*(1-Math.min(1,dt*9));if(P.ground&&Math.abs(P.vx)>2){P.stepT=(P.stepT||0)+dt*Math.abs(P.vx)/5.6;if(P.stepT>.24){P.stepT=0;sfx('step');if(Math.abs(P.vx)>7)puff(P.x-P.f*.2,P.y,1,1)}}P.fell=P.ground?0:Math.max(P.fell||0,P.vy);
 // an office chair: step or land on it and up you go
 if(P.ground)P.bn=0;var byy=Math.floor(P.y-.01);if(P.vy>=0&&tile(Math.floor(P.x),byy)==='B'&&P.y>=byy+.35){var good=!!jumpKey();P.bn=good?Math.min(2,P.bn+1):0;   // no timing: hold A and each bounce goes higher; let go to settle
  P.vy=[-18,-26.5,-31.5][P.bn];P.y=byy+.35;P.peak=P.y;P.sprung=true;P.ground=false;P.coy=0;jumpQ=0;P.hood=false;P.sq=1;sfx('boing');pops.push({x:P.x,y:P.y,life:.5,big:P.bn>0});if(P.bn===2)say('BOING!',P.x,P.y-2.4)}
 if(!P.slide&&P.ground&&sv>0)(L.slides||[]).forEach(function(sl){if(Math.abs(P.x-sl.x0)<.45&&Math.abs(P.y-sl.y0)<.2)P.slide={s:sl,u:0}});
 if(P.slide){var sl2=P.slide.s;P.slide.v=Math.min(17,(P.slide.v||5)+26*dt);P.slide.u+=dt*P.slide.v/Math.hypot(sl2.x1-sl2.x0,sl2.y1-sl2.y0);var su=Math.min(1,P.slide.u);P.x=sl2.x0+(sl2.x1-sl2.x0)*su;P.y=sl2.y0+(sl2.y1-sl2.y0)*su;P.vy=0;P.vx=0;P.f=1;P.ground=true;if(su>=1){P.slide=null;P.fling=.24;P.vx=13;say('WHEEE!',P.x,P.y-2.4)}}
 var onSpin=false;(L.spins||[]).forEach(function(sp){if(P.ground&&Math.abs(P.x-sp.x)<1.3&&Math.abs(P.y-sp.y)<.2)onSpin=true});if(onSpin){P.spinT+=dt;if(P.spinT>.75){P.spinT=0;P.fling=.95;P.vy=-19;P.sprung=true;P.ground=false;P.y-=.05;say('WHEEE!',P.x,P.y-2.4)}}else P.spinT=0;
 var onSee=false;(L.seesaws||[]).forEach(function(se){if(P.ground&&Math.abs(P.x-se.x)<.6&&P.y>MH-2.2)onSee=true});if(onSee){P.seeT+=dt;if(P.seeT>.65){P.seeT=0;S.seeAt=T;say('CANNONBALL!',P.x+3.1,MH-4.2);P.vy=-30;P.sprung=true;P.ground=false;P.y-=.05;pops.push({x:P.x,y:P.y,life:.5,big:true})}}else P.seeT=0;
 var cyy=Math.floor(P.y-.01),onChair=tile(Math.floor(P.x),cyy)==='^'||tile(Math.floor(P.x+.55),cyy)==='^'||tile(Math.floor(P.x-.55),cyy)==='^';if(P.vy>=0&&onChair&&P.y>=cyy+.15){   // generous: brush against it and up you go
  P.vy=-23;P.peak=P.y;P.sprung=true;P.ground=false;P.coy=0;jumpQ=0;P.hood=false;P.sq=1;sfx('boing');puff(P.x,P.y,5,3)}
 if(P.ground&&solid(Math.floor(P.x),Math.floor(P.y+.1))&&solid(Math.floor(P.x-1),Math.floor(P.y+.1))&&solid(Math.floor(P.x+1),Math.floor(P.y+.1)))P.safe=[P.x,P.y];
 if(P.y>MH+2){sfx('fall');S.shake=.3;P.inv=0;S.why='fell';S.batt-=.25;S.hits++;S.gyAt=T;S.gyLv=Math.max(1,Math.round((1-S.batt)/.25));say(L.lines.pit[0],P.safe[0],P.safe[1]-2.4);P.x=P.safe[0];P.y=P.safe[1];P.vx=P.vy=0;P.inv=1.6;if(family)P.wetT=3.5;if(S.batt<=.001){flat();return}}
 // the crying corner: no way past, over or through until they have their tissues
 if(!S.given){var cr=people.filter(function(q){return q.k==='Y'});if(cr.length){var ccx=(cr[0].x+cr[cr.length-1].x)/2,cfy=cr[0].y,reach=cr.length/2+.65;if(S.cryT>0)S.cryT-=dt;
   if(P.y<=cfy+.1&&P.y>cfy-4.8&&Math.abs(P.x-ccx)<reach){if(P.tissues){S.given=true;P.tissues=false;pops.push({x:ccx,y:cfy-1,life:.6,big:true});say(L.lines.Yok[0],ccx,cfy-2.9);info(L.toll.done,L.toll.doneB)}
    else{P.x=ccx+(P.x<ccx?-reach:reach);P.vx=0;if(!(S.cryT>0)){S.cryT=1.8;say(pick(L.lines.Y),ccx,cfy-2.9);info(L.toll.name,L.toll.block)}}}}}
 // collecting
 items.forEach(function(it){if(it.k==='a'&&!it.got&&it.sway)it.x=it.x0+Math.sin(S.t*1.1+it.x0)*it.sway});
 people.forEach(function(q){if(q.k!=='Q'||q.happy||Math.abs(P.x-q.x)>.95)return;
  if(P.balloons){q.happy=true;P.balloons=false;P.inv=Math.max(P.inv,1.5);S.rollT=Math.min(S.rollT||0,L.roll-5);pops.push({x:q.x,y:q.y-1,life:.6,big:true});say(pick(L.lines.Qok),q.x+1.4,q.y-2.6);info('BALLOONS RETURNED','She is delighted. The family has questions. Keep walking.')}
  else{P.x=q.x+(P.x<q.x?-.95:.95);P.vx=0;if(!(S.cryT>0)){S.cryT=2;say(pick(L.lines.Q),q.x,q.y-1.9);info('A LOST BUNCH OF BALLOONS','Nobody gets past until she has them back. Try the bouncy castle.')}}});if(S.cryT>0&&S.given)S.cryT-=dt;
 items.forEach(function(it){if(it.got||Math.abs(it.x-P.x)>(it.k==='a'?1.15:.7)||Math.abs(it.y-(P.y-HH/2))>(it.k==='a'?1.4:1))return;if(it.k==='a'&&P.balloons)return;it.got=true;if(it.k==='g'){S.list=(S.list||0)+1;sfx('power');var gi=L.laneY.indexOf(Math.round(it.y+.5));info(L.list[gi]+': GOT IT',S.list>=L.list.length?'That is everything. Join the queue at the back, on the right.':(L.list.length-S.list)+' more on the list.');return}
  if(it.k==='e'){S.keys++;S.batt=Math.min(1,S.batt+.015);S.keyPop=.22;sfx('key');fx.push({x:it.x,y:it.y,vx:0,vy:-2.2,life:.3,r:.16});if(S.keys===need()&&need()>0){sfx('power');info('THE WAY OUT IS UNLOCKED','You have '+need()+' keys. There are '+S.keyT+' if you want them all.')}return}sfx(it.k==='o'?'tea':'power');pops.push({x:it.x,y:it.y,life:.6,big:it.k!=='o'});
  if(it.k==='o'){S.tea++;S.batt=Math.min(1,S.batt+.08);S.glow=.5}
  else if(it.k==='N'){S.notes++;S.batt=1;S.glow=.6;info('DO NOT DISTURB','Social battery fully recharged.')}
  else if(it.k==='c'){P.fast=6;info('COFFEE','You run faster for 6 seconds.')}
  else if(it.k==='m'){P.shield=true;info('FAKE PHONE CALL','The next person who catches you lets you go.')}
  else if(it.k==='f'){P.plate=true;P.plateN=2;info('PLATE OF FOOD','People standing about help themselves and let you past. Two groups’ worth. Anyone moving knocks it out of your hands.')}
  else if(it.k==='t'){P.tissues=true;info(L.toll.item,L.toll.got)}
  else if(it.k==='a'){P.balloons=true;info('GOT THEM','You fall slowly now. Hold A and they lift you for a moment.')}
  else if(it.k==='b'){P.baby=8;info('SOMEBODY’S BABY','Everyone coos at the baby and ignores you. For 8 seconds.')}
  else if(it.k==='u'){P.brolly=true;info('UMBRELLA','Hold A while falling to float down gently.')}
  else{P.phones=7;info('HEADPHONES','Nobody can touch you for 7 seconds.')}});
 // a quiet room: a checkpoint, and a breather
 var kx=Math.floor(P.x),ky=Math.floor(P.y-.5);if(S.swT>0)S.swT-=dt;if(tile(kx,ky)==='L'){if(!(S.swT>0)&&!S.onSw){var zz=zoneAt(kx,ky);lit[zz.name]=!lit[zz.name];say(lit[zz.name]?'Lights on. Everyone can see you.':'Lights off. Nobody can see you.',kx+.5,ky-1.4)}S.onSw=true;S.swT=.3}else S.onSw=false;
 if(tile(kx,ky)==='K'&&(!S.cp||S.cp[0]!==kx+.5)){S.cp=[kx+.5,ky+1];S.batt=Math.min(1,S.batt+.25);sfx('quiet');say('Quiet room. Nobody in here.',kx+.5,ky-1.4)}
 // the door
 var dx=Math.floor(P.x),dy=Math.floor(P.y-.5);if(tile(dx,dy)==='D'||tile(dx,dy+1)==='D'||tile(dx,dy+2)==='D'||tile(dx,dy+3)==='D'){var short=L.list?L.list.length-(S.list||0):0;if(S.keys>=need()&&short<=0){win();return}if(!(S.lockT>0)){S.lockT=3;sfx('lose');if(short>0)info('HAVE YOU FORGOTTEN SOMETHING?','There '+(short>1?'are ':'is ')+short+' more thing'+(short>1?'s':'')+' on your list.');else info('LOCKED','You need '+need()+' keys to get out. You have '+S.keys+'.')}}if(S.lockT>0)S.lockT-=dt;   // through the door, or sailing over the top of it
 // people: standers stand, walkers walk between obstacles, talkers send out speech bubbles
 if(P.baby>0&&L.pram&&Math.abs(P.x-L.pram.x)<.9&&P.y>MH-2.3){P.baby=0;S.pramBaby=true;P.inv=Math.max(P.inv,2);pops.push({x:L.pram.x,y:MH-3,life:.6,big:true});say('Shh. Never happened.',P.x,P.y-2.6);info('BABY RETURNED','Back in the pram. Nobody saw a thing.')}
 if(P.baby>0){P.baby-=dt;if(P.baby<=0)info('THE BABY IS CRYING','You hand it to the nearest adult. You are on your own again.')}
 P.hid=P.ground&&Math.abs(P.vx)<1.2&&tile(Math.floor(P.x),Math.floor(P.y-.5))==='h';if(P.hid&&!S.seenH){S.seenH=true;info('BEHIND THE CURTAIN','Stand still here and nobody can see you. It does not use up your hood.')}
 var unseen=P.hid||P.laneT>0||P.hood||P.phones>0||P.baby>0||!!P.slide||P.spinT>0||P.fling>0||isDark(zoneAt(P.x,P.y-.5));   // nobody can get at you on a spinning roundabout, or while it flings you
 people.forEach(function(p){p.t+=dt;
  var near=Math.abs(P.y-p.y)<2.2&&Math.abs(P.x-p.x)<7,brol=S.wet>.5&&(p.k==='P'||p.k==='W');if(brol&&p.k==='P')p.f=1;
  var un=(p.k==='C'&&L.torch)?(P.hood||P.phones>0):unseen;
  if(p.k==='C'&&party&&isDark(zoneAt(p.x,p.y-.5))){p.run=0;p.rest=0;p.wind=0;p.lost=true;var gx=p.x+p.f*.5;if(solid(Math.floor(gx),Math.floor(p.y-.5))||tile(Math.floor(gx),Math.floor(p.y-.5))==='w'||!solid(Math.floor(gx),Math.floor(p.y+.1)))p.f=-p.f;else p.x+=p.f*.55*dt}
  else if(p.k==='C'){p.lost=false;if(p.rest>0)p.rest-=dt;else if(p.run>0){p.run-=dt;if(p.run<=0)p.rest=L.chaseRest||2.2}else if(near&&!un&&S.mode==='play'){p.run=L.chaseRun||3.1;p.wind=L.chaseWind||.55;p.f=P.x<p.x?-1:1;say(L.chaseCall||pick(L.lines.C),p.x,p.y-2.5);if(L.chaseCall&&!S.seenC){S.seenC=true;info('THE HOST HAS SPOTTED YOU','He points first, then runs. Jump him, or stand still behind a curtain.')}}
   if(p.wind>0)p.wind-=dt;else if(p.run>0){if(!un)p.f=P.x<p.x?-1:1;var cx2=p.x+p.f*.5;if(!(solid(Math.floor(cx2),Math.floor(p.y-.5))||tile(Math.floor(cx2),Math.floor(p.y-.5))==='w'||!solid(Math.floor(cx2),Math.floor(p.y+.1))))p.x+=p.f*(L.chaseSpeed||3.7)*dt}}
  else if(p.k==='R'){var ra=L.aisle;if(p.gone>0){p.gone-=dt;if(p.gone<=0){p.y=L.laneY[p.to];p.f=-p.f}}else{p.x+=p.f*(1.7+(p.i%3)*.45)*dt;if(p.x<ra[0]||p.x>ra[1]){p.x=Math.max(ra[0],Math.min(ra[1],p.x));var rl=L.laneY.indexOf(p.y),ex2=p.f>0?ra[1]+3:ra[0]-3,opts=[laneLink(rl,ex2,-1),laneLink(rl,ex2,1)].filter(function(q){return q!=null});if(opts.length&&Math.random()<.55){p.gone=1.2;p.to=pick(opts)}else p.f=-p.f}}}
  else if(p.k==='W'||p.k==='J'){var ax=p.x+p.f*.5,blocked=solid(Math.floor(ax),Math.floor(p.y-.5))||'^w'.indexOf(tile(Math.floor(ax),Math.floor(p.y-.5)))>=0||!solid(Math.floor(ax),Math.floor(p.y+.1))||people.some(function(o){return o!==p&&Math.abs(o.y-p.y)<.5&&Math.abs(o.x-ax)<.5});if(blocked)p.f=-p.f;else p.x+=p.f*(p.k==='J'?(L.kidSpeed||3):(L.walkSpeed||2.1))*dt}
  else if(p.k==='V'){var vp=p.t%6.4;p.on=vp<2.4||(vp>=3.2&&vp<5.6);p.f=vp<2.8?-1:vp<6?1:-1;var vd=(P.x-p.x)*p.f;if(Math.abs(P.x-p.x)<10&&!S.seenV){S.seenV=true;info('THE VIDEO CAMERA','Stay out of the beam. Hood up as it passes, or be up high.')}
   if(p.on&&!unseen&&S.mode==='play'&&vd>.7&&vd<6&&P.y>p.y-2.7&&P.y<p.y+.3){if(P.inv<=0)say(pick(L.lines.V),p.x,p.y-2.6);hurt('V',p.x)}}
  else if(p.k==='Z'){var zd=P.x-p.x;p.walk=false;if(S.mode==='play'&&!unseen&&Math.abs(zd)<11&&Math.abs(zd)>.3&&Math.abs(P.y-p.y)<9){p.f=zd>0?1:-1;var zx=p.x+p.f*.6;if(Math.abs(zx-p.home)<13&&!solid(Math.floor(zx),Math.floor(p.y-.5))&&solid(Math.floor(zx),Math.floor(p.y+.1))&&!people.some(function(o){return o!==p&&Math.abs(o.y-p.y)<.5&&Math.abs(o.x-zx)<.7})){p.x+=p.f*1.5*dt;p.walk=true}
    if(!S.seenZ){S.seenZ=true;info('AUNTIE WANTS A KISS','She is slow, but she will not stop. Jump over her, or lose her.')}p.q=(p.q||3)+dt;if(p.q>4){p.q=0;say(pick(L.lines.Z),p.x,p.y-2.6)}}}
  else if(p.k==='A'){var ae=p.x+p.f*2,ay=Math.floor(p.y-.5);if(solid(Math.floor(ae),ay)||tile(Math.floor(ae),ay)==='w'||!solid(Math.floor(ae),Math.floor(p.y+.1)))p.f=-p.f;else p.x+=p.f*2*dt;
   if(!unseen&&S.mode==='play'&&Math.abs(P.x-p.x)<1.95&&P.y>p.y-1.9&&P.y-HH<p.y){if(P.inv<=0)say(pick(L.lines.A),p.x,p.y-2.6);hurt('A',p.x)}
   if(Math.abs(P.x-p.x)<9&&Math.abs(P.y-p.y)<3&&!S.seenA){S.seenA=true;info('THE CONGA LINE','Jump the whole line, or put your hood up and let it go past.')}}
  else if(p.k==='M'){p.a=1.5708+2.1*Math.sin(p.t*.63);p.f=Math.cos(p.a)<0?-1:1;if(S.callT>0)S.callT-=dt;var mdx=P.x-p.x,mdy=(P.y-.9)-(p.y-1.5),md=Math.sqrt(mdx*mdx+mdy*mdy),mda=Math.atan2(-mdy,mdx)-p.a;while(mda>3.1416)mda-=6.2832;while(mda<-3.1416)mda+=6.2832;
   if(md<16&&!S.seenM){S.seenM=true;info('THE MEGAPHONE','It sweeps round like a searchlight. If it lands on you, everyone nearby comes over. Go when it points away.')}
   if(!unseen&&S.mode==='play'&&!(S.callT>0)&&md>1&&md<11&&Math.abs(mda)<.26){S.callT=4.5;say(pick(L.lines.M),p.x,p.y-3);people.forEach(function(o){if(o.k==='P'&&Math.abs(o.x-p.x)<16)o.chase=4})}}
  else if(p.k==='P'&&p.chase>0){p.chase-=dt;var cdx=P.x-p.x;p.walk=false;if(Math.abs(cdx)>.3){p.f=cdx>0?1:-1;var cfx=p.x+p.f*.5;if(!solid(Math.floor(cfx),Math.floor(p.y-.5))&&solid(Math.floor(cfx),Math.floor(p.y+.1))){p.x+=p.f*1.7*dt;p.walk=true}}}
  else if(p.k==='X'){p.fixed=true;if(p.flash>0)p.flash-=dt;var fe=L.flashEvery||3.4;p.fe=fe;if(p.t>fe){p.t=0;p.flash=.3;var fd=(P.x-p.x)*p.f;if(!unseen&&S.mode==='play'&&fd>0&&fd<3.6&&Math.abs(P.y-p.y)<2.2){say(pick(L.lines.X),p.x,p.y-2.6);hurt('X',p.x)}}}
  else if(p.k==='P'&&p.follow&&S.mode==='play'){var fdx=P.x-p.x;if(Math.abs(P.y-p.y)<3&&Math.abs(fdx)>.4&&!unseen){p.f=fdx>0?1:-1;var fx=p.x+p.f*.5;if(!solid(Math.floor(fx),Math.floor(p.y-.5))&&solid(Math.floor(fx),Math.floor(p.y+.1)))p.x+=p.f*1.2*dt}p.q=(p.q||0)+dt;if(p.q>4.5&&Math.abs(fdx)<9){p.q=0;say(p.line,p.x,p.y-2.5)}}
  else if(p.k!=='G'&&!p.fixed&&!brol&&Math.abs(P.x-p.x)<9&&Math.abs(P.y-p.y)<3)p.f=P.x<p.x?-1:1;
  if(p.k==='P'&&L.reach&&!p.fed&&p.x>16){var rp=p.t%3.4;p.reach=rp>2.6?2:rp>2?1:0;var rd=(P.x-p.x)*p.f;if(p.reach===2&&!unseen&&S.mode==='play'&&rd>.5&&rd<1.75&&P.ground&&P.y>p.y-1.2&&P.y<p.y+.3){if(P.plate)feed(p);else{if(P.inv<=0)say(pick(L.lines.reach),p.x,p.y-2.6);hurt('P',p.x)}}}else p.reach=0;
  if(L.chat&&S.mode==='play'&&L.chat[p.k]&&Math.abs(P.x-p.x)<10&&Math.abs(P.y-p.y)<6){p.ct=(p.ct==null?1+Math.random()*4:p.ct)-dt;if(p.ct<=0){p.ct=4+Math.random()*5;say(pick(L.chat[p.k]),p.x,p.y-2.9)}}
  if(p.k==='T'&&p.t>(L.talkEvery||2)&&Math.abs(P.x-p.x)<14&&Math.abs(P.y-p.y)<3){p.t=0;sfx('blip');bubbles.push({x:p.x+p.f*.6,y:p.y-.75,f:p.f,life:2.6,line:pick(L.lines.T)})}
  var small=p.k==='G'||p.k==='J';if(!(p.gone>0)&&p.k!=='Y'&&p.k!=='Q'&&p.k!=='M'&&p.k!=='V'&&p.k!=='A'&&!un&&Math.abs(P.x-p.x)<(small?.42:.62)&&P.y>p.y-(small?.8:1.95)&&P.y-HH<p.y){if(brol&&(p.k==='P'||(P.x-p.x)*p.f<.15))return;if(p.k==='P'&&(p.fed||P.plate)){if(!p.fed)feed(p);return}if(P.inv<=0){if(!p.line)p.line=pick(L.lines[p.k]);say(L.follow?p.line:pick(L.lines[p.k]),p.x,p.y-2.5);if(L.follow&&p.k==='P'&&!p.follow){p.follow=true;p.fixed=true;info('A RELATIVE IS FOLLOWING YOU','They will keep asking. Keep moving, or put your hood up.')}}hurt(p.k,p.x)}});
 if(L.roll&&S.mode==='play'){var mm=null;people.forEach(function(p){if(p.k==='M'&&Math.abs(p.x-P.x)<24&&(!mm||Math.abs(p.x-P.x)<Math.abs(mm.x-P.x)))mm=p});if(S.rollF>0)S.rollF-=dt;
  if(!mm){S.rollT=0;S.rollW=false}else{S.rollT=(S.rollT||0)+dt;mm.f=P.x<mm.x?-1:1;if(S.rollT>L.roll-1.8&&!S.rollW){S.rollW=true;if(!S.seenM){S.seenM=true;info('ROLL CALL','When the megaphone goes off, have your hood up or be off the ground.')}}
   if(S.rollT>=L.roll){S.rollT=0;S.rollW=false;S.rollF=.7;say('HAS ANYONE SEEN '+NAME.toUpperCase()+'?',mm.x,mm.y-2.7);if(!unseen&&P.ground&&tile(kx,ky)!=='K'){say(pick(L.lines.M),P.x,P.y-2.7);hurt('M',mm.x)}}}}
 bikes.forEach(function(b){b.t+=dt;if(b.x===null){if(b.t>=b.every){b.x=Math.min(Math.max(b.x1+7,cam+vw+2),b.x1+32);b.t=0}}else{b.x-=11*dt;if(b.x<Math.max(Math.min(b.x0-7,cam-2),b.x0-32))b.x=null;   /* they ride in from off the screen and out the other side, not out of thin air */
   else if(!unseen&&b.x>b.x0-.5&&b.x<b.x1+.5&&Math.abs(b.x-P.x)<.75&&P.y>MH-2-1.3&&P.y<=MH-2+.1){if(P.inv<=0)say(pick(L.lines.bike),P.x,P.y-2.6);hurt('bike',b.x)}}});
 bubbles=bubbles.filter(function(b){b.x+=b.f*4.4*dt;b.life-=dt;if(solid(Math.floor(b.x),Math.floor(b.y)))b.life=0;
  if(!unseen&&b.life>0&&Math.abs(b.x-P.x)<.62&&b.y>P.y-HH&&b.y<P.y){if(P.inv<=0)say(b.line,P.x,P.y-2.6);hurt('bubble',b.x);b.life=0}return b.life>0});
 fx=fx.filter(function(q){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=1.5*dt;return q.life>0});
 says=says.filter(function(s){s.life-=dt;return s.life>0});pops=pops.filter(function(q){q.life-=dt;return q.life>0});if(S.zoneT>0)S.zoneT-=dt;if(S.info&&(S.info.t-=dt)<=0)S.info=null;if(S.glow>0)S.glow-=dt}

function isDark(z){return !!z.dark&&!lit[z.name]}
function zoneAt(x,y){var u2=L.upstairs,zi;if(party||L.laneY){for(zi=0;zi<L.zones.length;zi++){var q=L.zones[zi];if(x>=q.x0&&x<q.x1&&y>=q.y0&&y<q.y1+2)return q}return L.zones[0]}if(u2&&y<10.5&&x>=u2.x0&&x<u2.x1)return u2;for(var i=0;i<L.zones.length;i++)if(x<L.zones[i].x1)return L.zones[i];return L.zones[L.zones.length-1]}
// ---- painting: flat colours and chunky outlines ----
var W=0,H=0,u=30,vw=13,sceneH=0,sceneY=0,dpr=1,cam=0,camY=0,tall=false,PAD={};
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);tall=H>W;
 u=tall?Math.min(W/12,H*.58/VIEW):Math.min(H/VIEW,W/14);sceneH=VIEW*u;sceneY=tall?0:Math.max(0,(H-sceneH)/2);vw=W/u;
 var r=tall?Math.min(44,W*.11):Math.min(46,H*.11);if(tall){var y0=sceneH,h=H-sceneH,cy=y0+Math.min(h*.34,h/2);PAD={s:{x:W*.24,y:cy,r:r*1.25},b:{x:W*.86-r*2.3,y:cy+r*.55,r:r},a:{x:W*.86,y:cy-r*.55,r:r}}}
 else{var by=H-Math.max(96,H*.2);PAD={s:{x:Math.max(86,W*.1),y:by,r:r*1.25},b:{x:W-Math.max(70,W*.07)-r*2.4,y:by+r*.3,r:r},a:{x:W-Math.max(70,W*.07),y:by-r*.7,r:r}}}}
function ink(w){cx.strokeStyle=INK;cx.lineWidth=w||.08;cx.lineJoin='round';cx.stroke()}
function rr(x,y,w,h,r){cx.beginPath();cx.roundRect(x,y,w,h,r)}
// People, from Barry's flat sheets. Standers come in three kinds; each has an idle pose and a talking one.
function sprite(name,frame,x,y,flip,k){var a=ART[name],im=IMG[name];if(!im.naturalWidth)return;cx.save();cx.translate(x,y);if(flip)cx.scale(-1,1);cx.drawImage(im,frame*a.w,0,a.w,a.h,-a.ax*k,-a.base*k,a.w*k,a.h*k);cx.restore()}
function person(p){if(p.k==='G'){dog(p);return}if(p.k==='Q'){kid(p);return}if(p.k==='Y'){crier(p);return}var PEO=shop?'shop-people':street?'street-people':family?'park-people':party?'party-people':'flat-people',MOV=shop?'shop-movers':(street||family)?'street-movers':'flat-movers',c=cx,k=1/PPT,near=Math.abs(P.x-p.x)<3.2&&Math.abs(P.y-p.y)<2.5;c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(p.x,p.y,.5,.08,0,0,6.2832);c.fill();
 if(p.k==='A'){[1.35,.45,-.45,-1.35].forEach(function(o,i){var ax=p.x+o*p.f,hop=calm?0:Math.abs(Math.sin(T*8+i*1.2))*.14;c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(ax,p.y,.4,.07,0,0,6.2832);c.fill();sprite('party-dancer',(Math.floor(p.t/.16)+i)%4,ax,p.y+.03-hop,p.f<0,k)});return}
 if(p.k==='V'){var vx=p.x+p.f*1.25,vy=p.y-1.72;if(p.on){var vg=c.createLinearGradient(vx,0,vx+p.f*5,0);vg.addColorStop(0,'rgba(255,90,90,.5)');vg.addColorStop(1,'rgba(255,90,90,.08)');c.fillStyle=vg;c.beginPath();c.moveTo(vx,vy);c.lineTo(p.x+p.f*6,p.y-2.7);c.lineTo(p.x+p.f*6,p.y);c.closePath();c.fill()}sprite('park-cast',p.on?0:1,p.x,p.y+.03,p.f<0,k);return}
 if(p.k==='M'){var loud=S.callT>3,ma=p.a||1.57,el=Math.cos(ma)>=0?ma:3.1416-ma,mfr=loud?4:el<-.2?0:el<.4?1:el<1.15?2:3,ox=p.x,oy=p.y-1.5;
  c.fillStyle=loud?'rgba(224,48,58,.3)':'rgba(250,208,12,.26)';c.beginPath();c.moveTo(ox+Math.cos(ma)*1.2,oy-Math.sin(ma)*1.2);c.lineTo(ox+Math.cos(ma+.26)*11,oy-Math.sin(ma+.26)*11);c.lineTo(ox+Math.cos(ma-.26)*11,oy-Math.sin(ma-.26)*11);c.closePath();c.fill();sprite('park-mega',mfr,p.x,p.y+.03,p.f<0,k);return}
 if(p.k==='Z'){sprite('park-cast',p.walk?3+(calm?0:Math.floor(T/.26)%2):2,p.x,p.y+.03,p.f<0,k);if(p.walk){var hx=p.x+p.f*.3,hy=p.y-2.6-(calm?0:Math.abs(Math.sin(T*4))*.12);c.fillStyle='#e0303a';c.beginPath();c.moveTo(hx,hy+.16);c.bezierCurveTo(hx-.26,hy-.02,hx-.12,hy-.22,hx,hy-.08);c.bezierCurveTo(hx+.12,hy-.22,hx+.26,hy-.02,hx,hy+.16);c.fill();ink(.05)}return}
 if(p.k==='J'){sprite(MOV,Math.floor(p.t/.09)%4,p.x,p.y+.03,p.f<0,k*.5);return}
 if(p.k==='X'){sprite(PEO,6,p.x,p.y+.03,p.f<0,k);var cxx=p.x+p.f*.5,cyy2=p.y-1.25;c.fillStyle=INK;rr(cxx-.2,cyy2-.14,.4,.28,.05);c.fill();c.fillStyle='#9fd3ff';c.beginPath();c.arc(cxx+p.f*.12,cyy2,.09,0,6.2832);c.fill();
  var ch=Math.max(0,(p.t-((p.fe||3.4)-1.3))/1.3);if(ch>0&&!(p.flash>0)){c.strokeStyle=YEL;c.lineWidth=.09;c.beginPath();c.arc(cxx,cyy2-.55,.26,-1.57,-1.57+6.283*Math.min(1,ch));c.stroke()}
  if(p.flash>0){var fg=c.createLinearGradient(cxx,0,cxx+p.f*3.6,0);fg.addColorStop(0,'rgba(255,255,255,.95)');fg.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=fg;c.beginPath();c.moveTo(cxx,cyy2);c.lineTo(cxx+p.f*3.6,cyy2-2.2);c.lineTo(cxx+p.f*3.6,p.y+.05);c.closePath();c.fill()}return}
 if(p.k==='R'){if(p.gone>0)c.globalAlpha=Math.max(.08,Math.min(1,Math.abs(p.gone-.6)/.6));var rv=p.i%4,rf=Math.floor(p.t/.13)%4;if(rv===0)sprite(MOV,rf,p.x,p.y+.03,p.f<0,k);else sprite('shop-walkers',(rv-1)*4+rf,p.x,p.y+.03,p.f<0,k);c.globalAlpha=1;return}
 if(p.k==='W'){if(party)sprite('party-dancer',Math.floor(p.t/.16)%4,p.x,p.y+.03,p.f<0,k);else if(street&&S.wet>.5)sprite('street-rain',8+Math.floor(p.t/.13)%4,p.x,p.y+.03,p.f<0,k);else sprite(MOV,Math.floor(p.t/.13)%4,p.x,p.y+.03,p.f<0,k)}
 else if(p.k==='C'&&party){sprite('party-host',p.lost?[4,5,4,6,5,7][Math.floor(p.t/.5)%6]:p.wind>0?1:p.run>0?Math.floor(p.t/.1)%3:p.rest>0?3:1,p.x,p.y+.03,p.f<0,k);
  if(p.run>0||p.rest>0){c.fillStyle='#fff';c.beginPath();c.ellipse(p.x,p.y-2.85,.26,.2,0,0,6.2832);c.fill();ink(.06);c.fillStyle='#e0303a';c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(p.run>0?'!':'~',p.x,p.y-2.84)}}
 else if(p.k==='C'){sprite(MOV,p.lost?(Math.floor(p.t/.45)%2?5:7):p.wind>0?5:p.run>0?4+Math.floor(p.t/.1)%3:p.rest>0?7:5,p.x,p.y+.03,p.f<0,k);
  if(p.run>0||p.rest>0){c.fillStyle='#fff';c.beginPath();c.ellipse(p.x,p.y-2.45,.26,.2,0,0,6.2832);c.fill();ink(.06);c.fillStyle='#e0303a';c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(p.run>0?'!':'~',p.x,p.y-2.44)}}
 else if(p.k==='T'){if(shop)thing('till',p.x+.9,p.y+.02,3.3,false,'shop-things');if(p.sheet)sprite(p.sheet,p.base+(p.t<.55?1:0),p.x,p.y+.03,p.f<0,k);else sprite(PEO,p.t<.55?3:2,p.x,p.y+.03,p.f<0,k)}
 else if(street&&S.wet>.5&&p.k==='P')sprite('street-rain',p.skin,p.x,p.y+.03,p.f<0,k);
 else{sprite(PEO,p.skin+((near&&!p.fed)||p.reach||p.chase>0?1:0),p.x,p.y+.03-(p.chase>0&&p.walk&&!calm?Math.abs(Math.sin(T*8+p.x))*.08:0),p.f<0,k);
  if(p.reach===1){c.fillStyle=YEL;c.beginPath();c.arc(p.x,p.y-2.5,.24,0,6.2832);c.fill();ink(.06);c.fillStyle=INK;c.font='800 .32px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('!',p.x,p.y-2.48)}
  if(p.reach===2&&!shop){c.strokeStyle=INK;c.lineWidth=.2;c.lineCap='round';c.beginPath();c.moveTo(p.x+p.f*.3,p.y-1.15);c.lineTo(p.x+p.f*1.25,p.y-1.05);c.stroke();c.strokeStyle='#ffd0a6';c.lineWidth=.11;c.stroke();thing('punch',p.x+p.f*1.4,p.y-.8,.5,false,'party-things')}
  if(p.fed&&!calm){c.fillStyle='#e0303a';c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('♥',p.x,p.y-2.3-Math.abs(Math.sin(T*3+p.x))*.1)}}}
function crier(p){if(!party){var c0=cx;c0.fillStyle='rgba(27,27,42,.18)';c0.beginPath();c0.ellipse(p.x,p.y,.6,.08,0,0,6.2832);c0.fill();sprite('park-people',S.given?1:0,p.x,p.y+.03,true,1/PPT);return}var c=cx,k=1/PPT,left=!people.some(function(q){return q.k==='Y'&&q.x<p.x-.1});if(!left)return;var mx=p.x+.5;c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(mx,p.y,1,.09,0,0,6.2832);c.fill();
 sprite('party-criers',S.given?2:Math.floor(T/1.7)%2,mx,p.y+.03,false,k);
 if(S.given){var hx2=mx,by2=p.y-2.75-(calm?0:Math.abs(Math.sin(T*3))*.15);c.fillStyle='#e0303a';c.beginPath();c.moveTo(hx2,by2+.16);c.bezierCurveTo(hx2-.26,by2-.02,hx2-.12,by2-.22,hx2,by2-.08);c.bezierCurveTo(hx2+.12,by2-.22,hx2+.26,by2-.02,hx2,by2+.16);c.fill();ink(.05)}}
function tissueBox(x,y,sc){sprite('party-criers',3,x,y,false,sc/PPT)}
var garyT=0;function garyPop(){var g=$('pggary');clearTimeout(garyT);g.classList.remove('on');void g.offsetWidth;g.classList.add('on');garyT=setTimeout(function(){g.classList.remove('on')},2300)}
function nemesis(){if(S.nemAt==null)return;var a=T-S.nemAt,D=2.1;if(a<0||a>D)return;var c=cx,sd=S.nemSide||1,inn=Math.min(1,a/.18,(D-a)/.18),ex=sd>0?cam+vw:cam,ny=Math.min(camY+VIEW-.6,Math.max(camY+3,P.safe?P.safe[1]:P.y)),k=1/PPT,fr=calm?1:1+Math.floor(a/.22)%2,tx=ex-sd*1.1,floor=solid(Math.floor(tx),Math.floor(ny+.1))&&!solid(Math.floor(tx),Math.floor(ny-.5)),nx,ty;
 var inset=Math.max(2.7,W*.2/u+.9);if(floor){nx=ex+sd*(1.6-(1.6+inset)*inn);sprite('nemesis',fr,nx,ny+.03,sd>0,k);ty=ny-2.6}else{nx=ex-sd*(inset+.4);var by=camY+VIEW+1.9-2.1*inn;sprite('nemesis',3,nx,by,sd>0,k*1.25);ty=by-2.4}
 c.save();c.translate(nx-sd*1.2,ty);c.rotate(calm?0:Math.sin(T*14)*.07);c.font='900 .5px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineWidth=.14;c.strokeStyle=INK;c.strokeText('HA HA HA!',0,0);c.fillStyle=YEL;c.fillText('HA HA HA!',0,0);c.restore()}
function nemPic(fr){var el=$('pgnem'),a=ART.nemesis,sc=.5;if(fr==null){el.hidden=true;return}el.hidden=false;el.style.width=a.w*sc+'px';el.style.height=a.h*sc+'px';el.style.background='url('+SRC+'nemesis) '+(-fr*a.w*sc)+'px 0/'+(a.W*sc)+'px '+(a.h*sc)+'px no-repeat'}
function thing(name,x,y,w,flip,sheet){sheet=sheet||'flat-things';var it=ART[sheet].items[name],im=IMG[sheet],k=1/PPT;if(!im.naturalWidth)return;var dw=(w||it.w*k),dh=it.h*k*(w?w/(it.w*k):1);cx.save();cx.translate(x,y);if(flip)cx.scale(-1,1);cx.drawImage(im,it.x,ART[sheet].H-it.h,it.w,it.h,-dw/2,-dh,dw,dh);cx.restore()}
// Background dressing, deliberately pale and outline-free so nobody mistakes it for something to jump on.
var WASH=null;
function washed(im){if(!WASH){WASH=document.createElement('canvas');WASH.width=im.naturalWidth;WASH.height=im.naturalHeight;var w=WASH.getContext('2d');w.drawImage(im,0,0);w.globalCompositeOperation='source-atop';w.fillStyle='rgba(150,205,160,.5)';w.fillRect(0,0,WASH.width,WASH.height)}return WASH}
function backdrop(x,base,kind,tn,sheet){var dc=ART[sheet||'flat-decor'],im=IMG[sheet||'flat-decor'],it=dc.items[kind];if(im&&im.naturalWidth&&it){var k3=1/dc.ppt,solidPic=sheet==='park-decor';if(solidPic)im=washed(im);cx.globalAlpha=solidPic?1:sheet==='shop-decor'?.5:.42;cx.drawImage(im,it.x,dc.H-it.h,it.w,it.h,x+1.7-it.w*k3/2,base-it.h*k3,it.w*k3,it.h*k3);cx.globalAlpha=1}}
function backdropOld(x,base,kind,tn){var c=cx,A=tn[0],B=tn[1],D=tn[2],i,j;
 if(kind>5){backdrop2(x,base,kind,A,B,D);return}
 if(kind===0){c.fillStyle=B;c.fillRect(x,base-1.05,2.6,.16);c.fillRect(x+.15,base-.9,.14,.9);c.fillRect(x+2.3,base-.9,.14,.9);c.fillStyle=D;rr(x+.9,base-1.95,1,.7,.06);c.fill();c.fillRect(x+1.32,base-1.25,.16,.2);c.fillStyle=A;rr(x+.98,base-1.87,.84,.54,.04);c.fill();c.fillStyle=B;rr(x+3,base-1.3,.7,.7,.2);c.fill();c.fillRect(x+3.28,base-.6,.14,.6)}
 else if(kind===1){c.fillStyle=B;rr(x,base-2.1,3.4,2.1,.12);c.fill();c.fillStyle=A;rr(x+.2,base-1.9,1.4,.9,.06);c.fill();rr(x+1.8,base-1.9,1.4,.9,.06);c.fill();c.fillStyle=D;c.fillRect(x+.4,base-1.7,.5,.4);c.fillRect(x+2.1,base-1.6,.7,.3)}
 else if(kind===2){c.fillStyle=D;c.beginPath();c.moveTo(x+.5,base-.7);c.lineTo(x+1.3,base-.7);c.lineTo(x+1.15,base);c.lineTo(x+.65,base);c.closePath();c.fill();c.fillStyle='#cfd3a0';for(var i=0;i<6;i++){c.beginPath();c.ellipse(x+.9+Math.cos(i*1.05+.5)*.55,base-1.5+Math.sin(i*1.05+.5)*.5,.55,.2,i*1.05+.5,0,6.2832);c.fill()}}
 else if(kind===3){c.fillStyle=B;rr(x,base-3.2,2.2,3.2,.08);c.fill();c.fillStyle=A;for(var j=0;j<4;j++)c.fillRect(x+.15,base-3.05+j*.78,1.9,.6);c.fillStyle=D;for(var j2=0;j2<4;j2++)for(var q=0;q<5;q++)c.fillRect(x+.25+q*.36,base-2.95+j2*.78+((q+j2)%3)*.06,.22,.5-((q+j2)%3)*.06)}
 else if(kind===4){c.fillStyle=B;rr(x,base-1.5,1.9,1.5,.1);c.fill();c.fillStyle=D;rr(x+.1,base-1.75,1.7,.3,.08);c.fill();c.fillStyle=A;c.fillRect(x+.3,base-1.1,1.3,.12);c.fillRect(x+.3,base-.7,1.3,.4)}
 else{c.fillStyle='#d6e3e6';rr(x+.2,base-2.1,.7,.8,.25);c.fill();c.fillStyle=A;rr(x+.1,base-1.3,.9,1.3,.08);c.fill();c.fillStyle=D;c.fillRect(x+.4,base-.9,.3,.14)}}
function backdrop2(x,base,kind,A,B,D){var c=cx,i,j;
 if(kind===6){for(i=0;i<3;i++){c.fillStyle=i%2?B:D;rr(x+i*.95,base-2.9,.88,2.9,.06);c.fill();c.fillStyle=A;c.fillRect(x+i*.95+.18,base-2.6,.5,.07);c.fillRect(x+i*.95+.18,base-2.45,.5,.07);c.fillRect(x+i*.95+.62,base-1.5,.08,.3)}}
 else if(kind===7){c.fillStyle=D;c.fillRect(x+.2,base-.25,.12,.25);c.fillRect(x+2.9,base-.25,.12,.25);c.fillRect(x+.2,base-2.9,.1,2.7);c.fillRect(x+2.92,base-2.9,.1,2.7);c.fillStyle='#fbfaf4';rr(x+.3,base-2.8,2.6,1.9,.06);c.fill();c.strokeStyle=D;c.lineWidth=.07;c.stroke();c.strokeStyle=B;c.lineWidth=.06;c.beginPath();c.rect(x+.55,base-2.55,.6,.4);c.rect(x+1.9,base-2.3,.7,.4);c.rect(x+1,base-1.6,.7,.4);c.moveTo(x+1.15,base-2.35);c.lineTo(x+1.9,base-2.1);c.moveTo(x+2.2,base-1.9);c.lineTo(x+1.7,base-1.5);c.stroke()}
 else if(kind===8){c.fillStyle=B;rr(x+.6,base-1.15,2.2,.16,.06);c.fill();c.fillRect(x+1.62,base-1,.16,1);c.fillRect(x+1.2,base-.1,1,.1);c.fillStyle=D;[x+.1,x+2.75].forEach(function(sx){rr(sx,base-.75,.6,.14,.06);c.fill();c.fillRect(sx+.24,base-.62,.12,.62)});c.fillStyle=A;rr(x+1.1,base-1.4,.3,.26,.05);c.fill();rr(x+1.9,base-1.36,.4,.22,.05);c.fill()}
 else if(kind===9){c.fillStyle=D;rr(x+.3,base-3,1.9,3,.1);c.fill();c.fillStyle=A;rr(x+.45,base-2.8,1.15,1.9,.05);c.fill();c.fillStyle=B;for(i=0;i<4;i++)for(j=0;j<3;j++)rr(x+.55+j*.36,base-2.7+i*.45,.26,.32,.04),c.fill();c.fillStyle=A;c.fillRect(x+1.75,base-2.6,.3,.5);c.fillStyle=B;rr(x+.5,base-.7,1.5,.4,.05);c.fill()}
 else if(kind===10){c.fillStyle=B;rr(x,base-1.3,3.4,1.3,.06);c.fill();c.fillStyle=D;c.fillRect(x,base-1.38,3.4,.14);c.fillStyle=A;for(i=0;i<3;i++)rr(x+.15+i*1.1,base-1.1,.95,.95,.05),c.fill();c.fillStyle=D;rr(x+.3,base-2,.9,.6,.06);c.fill();c.fillStyle=A;c.fillRect(x+.38,base-1.92,.55,.44);c.fillStyle=D;rr(x+2.3,base-1.95,.5,.57,.14);c.fill();c.fillRect(x+2.75,base-1.8,.16,.08)}
 else if(kind===11){c.fillStyle=D;rr(x+.1,base-1.5,3.2,1.1,.25);c.fill();c.fillStyle=B;rr(x,base-.95,3.4,.75,.2);c.fill();c.fillStyle=A;rr(x+.35,base-1.05,1.25,.35,.12);c.fill();rr(x+1.8,base-1.05,1.25,.35,.12);c.fill();c.fillStyle=D;c.fillRect(x+.3,base-.2,.16,.2);c.fillRect(x+2.95,base-.2,.16,.2)}
 else{c.fillStyle=B;rr(x,base-1.6,3.4,1.6,.1);c.fill();c.fillStyle=D;c.fillRect(x,base-1.68,3.4,.16);c.fillStyle=A;rr(x+.9,base-1.25,1.6,.6,.08);c.fill();c.fillStyle=D;rr(x+2.2,base-2.3,.9,.6,.05);c.fill();c.fillRect(x+2.58,base-1.72,.14,.1);c.beginPath();c.arc(x+.6,base-1.85,.16,0,6.2832);c.fill()}}
function poster(x,y,n){var c=cx,k=((n%4)+4)%4,bg=['#f6d9c9','#d5e6dc','#dcdcf0','#f3e6b8'][k],fg=['#e59a7a','#7fb59a','#9896cf','#d9b441'][k];c.fillStyle='#fffaf0';rr(x-.85,y,1.7,2.1,.06);c.fill();c.strokeStyle='#cdb98c';c.lineWidth=.06;c.stroke();c.fillStyle=bg;c.fillRect(x-.7,y+.15,1.4,1.45);c.fillStyle=fg;
 if(k===0){c.beginPath();c.moveTo(x,y+.9);c.arc(x,y+.9,.5,-1.57,2.2);c.closePath();c.fill();c.globalAlpha=.45;c.beginPath();c.arc(x,y+.9,.5,0,6.2832);c.fill();c.globalAlpha=1}
 else if(k===1){[.35,.7,.5,1].forEach(function(h,i){c.fillRect(x-.55+i*.3,y+1.5-h,.22,h)})}
 else if(k===2){c.beginPath();c.moveTo(x-.7,y+1.6);c.lineTo(x-.2,y+.7);c.lineTo(x+.1,y+1.2);c.lineTo(x+.35,y+.9);c.lineTo(x+.7,y+1.6);c.closePath();c.fill();c.beginPath();c.arc(x+.4,y+.5,.16,0,6.2832);c.fill()}
 else{c.lineWidth=.09;c.strokeStyle=fg;c.beginPath();c.moveTo(x-.55,y+1.35);c.lineTo(x-.2,y+1);c.lineTo(x+.1,y+1.15);c.lineTo(x+.55,y+.45);c.stroke();c.beginPath();c.moveTo(x+.55,y+.45);c.lineTo(x+.25,y+.5);c.lineTo(x+.5,y+.75);c.closePath();c.fill()}
 c.fillStyle='#cdb98c';c.fillRect(x-.5,y+1.75,1,.07);c.fillRect(x-.35,y+1.9,.7,.05)}
// The high street, in Barry's drawings (stealth-art/src/street-*.png).
function dog(p){var c=cx;c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(p.x,p.y,.42,.07,0,0,6.2832);c.fill();thing('dog',p.x-.12,p.y+.03,null,true,'street-things')}
function partyZone(z,x0,x1){var c=cx,zw=z.x1-z.x0,i;if(z.x1<x0||z.x0>x1)return;c.fillStyle=z.wall;c.fillRect(z.x0,z.y0,zw,z.y1-z.y0+(z.out?2:0));
 if(z.out){for(i=0;i<zw*1.2;i++){var sx=z.x0+((i*37)%(zw*10))/10,sy=1+((i*53)%140)/10;c.fillStyle='rgba(255,255,255,'+(.35+((i*7)%5)*.1)+')';c.fillRect(sx,sy,.08,.08)}c.fillStyle='#f6efe0';c.beginPath();c.arc(z.x0+zw*.6,4,1.1,0,6.2832);c.fill();c.fillStyle=z.wall;c.beginPath();c.arc(z.x0+zw*.6+.45,3.75,1,0,6.2832);c.fill();
  c.fillStyle=z.dado;for(i=Math.floor(z.x0);i<z.x1;i++){c.fillRect(i+.08,z.y1-2.2,.84,2.2);c.beginPath();c.moveTo(i+.08,z.y1-2.2);c.lineTo(i+.5,z.y1-2.6);c.lineTo(i+.92,z.y1-2.2);c.fill()}partyDecor(z,x0,x1);return}
 c.fillStyle=z.dado;c.fillRect(z.x0,z.y1-2.8,zw,2.8);c.fillStyle=z.rail;c.fillRect(z.x0,z.y1-2.88,zw,.12);
 for(i=Math.floor(Math.max(z.x0,x0)/7)*7+2;i<Math.min(z.x1,x1);i+=7){if(i<z.x0+1||i>z.x1-2||solid(i,Math.floor(z.y0+1.4)))continue;c.fillStyle='#fff8dc';c.beginPath();c.moveTo(i-.5,z.y0+.9);c.lineTo(i+.5,z.y0+.9);c.lineTo(i+.3,z.y0+.45);c.lineTo(i-.3,z.y0+.45);c.closePath();c.fill();c.fillStyle='rgba(27,27,42,.5)';c.fillRect(i-.03,z.y0,.06,.45)}
 partyDecor(z,x0,x1)}
function partyDecor(z,x0,x1){var i;if(z.kinds.length)for(i=Math.floor(Math.max(z.x0,x0-5)/5);i*5<Math.min(z.x1,x1);i++){var bx=i*5+1,fy=Math.floor(z.y1);if(bx<z.x0+.3||bx+3.6>z.x1||!solid(Math.floor(bx+1),fy)||!solid(Math.floor(bx+2.5),fy)||solid(Math.floor(bx+1.7),fy-1))continue;backdrop(bx,z.y1,z.kinds[((i*7)%z.kinds.length+z.kinds.length)%z.kinds.length],null,'party-decor')}}
function balloons(x,y,sc){thing('balloons',x,y+.5*sc,1.15*sc,false,'park-things')}
function kid(p){var c=cx,k=1/PPT,fr=calm?0:Math.floor(T/.5+p.x)%2;c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(p.x+2.1,p.y,1.1,.09,0,0,6.2832);c.ellipse(p.x,p.y,.3,.06,0,0,6.2832);c.fill();
 sprite('park-parents',p.happy?1:0,p.x+2.1,p.y+.03,false,k);sprite('park-kid',p.happy?2+fr:(Math.floor(T/.9+p.x)%2),p.x,p.y+.03-(p.happy&&fr===0?.12:0),false,k)}
function pdraw(name,x,y,w,h,flip){var a=ART['park-play'],it=a.items[name],im=IMG['park-play'];if(!im.naturalWidth)return;cx.save();cx.translate(x,y);if(flip)cx.scale(-1,1);cx.drawImage(im,it.x+2,a.H-it.h,it.w-4,it.h,-w/2,-h,w,h);cx.restore()}
function ghosted(x,y){var g=L.ghost||[],i;for(i=0;i<g.length;i++)if(x>=g[i][0]&&x<=g[i][1]&&y>=g[i][2]&&y<=g[i][3])return g[i][4]?1:2;return 0}
function playground(x0,x1){var c=cx,base=MH-2,x,y;
 (L.slides||[]).forEach(function(sl){var w=(sl.x1-sl.x0)/.64,h=(sl.y1-sl.y0)/.673,lx=sl.x0-.33*w;if(lx+w<x0||lx>x1)return;pdraw('slide',lx+w/2,sl.y1+.15,w,h,false)});
 if(L.tree&&L.tree.x>x0-5&&L.tree.x<x1+5){var th=5.4,ty=L.tree.y+th*.45;[-2.36,2.04].forEach(function(o){c.fillStyle=INK;c.fillRect(L.tree.x+o-.06,ty-.4,.44,base-ty+.4);c.fillStyle='#cf7a2a';c.fillRect(L.tree.x+o,ty-.4,.32,base-ty+.4)});pdraw('treehouse',L.tree.x,ty,5.7,th,false)}
 if(L.band&&L.band.x>x0-9&&L.band.x<x1+9){pdraw2('bandstand',L.band.x,L.band.y+8.6*.18,13.4,8.6)}
 (L.spins||[]).forEach(function(sp){if(sp.x<x0-3||sp.x>x1+3)return;pdraw('roundabout',sp.x,base+.05,4.3,2.9,false);if(calm)return;sp.a=(sp.a||0)+(P.spinT>0?.22:.035);for(var i=0;i<8;i++){var q=sp.a+i*.7854,sn=Math.sin(q);if(sn<.12)continue;var mx=sp.x+Math.cos(q)*2.02,my=base-1.02+sn*.4;c.fillStyle='#fff';c.globalAlpha=.9;c.beginPath();c.ellipse(mx,my,.13*sn+.04,.09,0,0,6.2832);c.fill();c.globalAlpha=1;ink(.04)}});
 (L.seesaws||[]).forEach(function(se){if(se.x<x0-4||se.x>x1+4)return;var tip=S.seeAt!=null&&T-S.seeAt<2.4,kx=se.x+3.15,kk=.64/PPT;pdraw('seesaw',se.x+1.5,base+.05,4.3,2.3,!tip);if(tip)sprite('park-cast',5,kx,base-.3,true,1/PPT);else if(P.seeT>0){var su=Math.min(1,P.seeT/.65),top=(L.tree?L.tree.y:base-8)-.2;c.save();c.translate(kx,top+(base-1.7-top)*su*su);c.rotate(calm?0:su*5);sprite('park-cast',5,0,.6,true,1/PPT);c.restore()}});
 movers.forEach(function(m){if(!m.sw||m.cx<x0-5||m.cx>x1+5)return;var fh=5.3,py=base-fh*.9,a=ART['park-play'],it=a.items.swingseat,im=IMG['park-play'];pdraw('swingframe',m.cx,base+.05,5,fh,false);if(!im.naturalWidth)return;
  [-1,1].forEach(function(o){c.lineCap='round';c.strokeStyle=INK;c.lineWidth=.11;c.beginPath();c.moveTo(m.cx+o*.5,py);c.lineTo(m.x+o*.85,m.y+.08);c.stroke();c.strokeStyle='#c9ccd3';c.lineWidth=.05;c.stroke()});
  var sh2=Math.round(it.h*.25);c.drawImage(im,it.x+2,a.H-sh2,it.w-4,sh2,m.x-1.05,m.y-.08,2.1,.48)});
 for(x=Math.max(0,x0);x<Math.min(MW,x1);x++)if(MAP[base-1].charAt(x)==='B'&&MAP[base-1].charAt(x-1)!=='B'){var n=0;while(MAP[base-1].charAt(x+n)==='B')n++;var sq=(P.bn>0&&P.x>x-1&&P.x<x+n+1&&P.y>base-1.4)?.12:0;pdraw('castle',x+n/2,base+.05,n*1.42,3.5-sq,false)}}
function pdraw2(name,x,y,w,h){var a=ART['park-things'],it=a.items[name],im=IMG['park-things'];if(!im.naturalWidth)return;cx.drawImage(im,it.x,a.H-it.h,it.w,it.h,x-w/2,y-h,w,h)}
function babyPic(x,y,sc){thing('baby',x,y+.3*sc,.9*sc,false,'park-things')}
function familyZone(z,x0,x1){var c=cx,zw=z.x1-z.x0,base=MH-2,i;if(z.x1<x0||z.x0>x1)return;c.fillStyle='#bfe6f7';c.fillRect(z.x0,0,zw,MH);
 for(i=Math.floor(Math.max(z.x0,x0)/11)*11;i<Math.min(z.x1,x1);i+=11){if(i<z.x0)continue;c.fillStyle='rgba(255,255,255,.85)';c.beginPath();c.ellipse(i+3,3+(i%3)*.9,1.5,.42,0,0,6.2832);c.ellipse(i+4.1,3.3+(i%3)*.9,1.1,.36,0,0,6.2832);c.fill()}
 c.fillStyle='#5fa552';c.fillRect(z.x0,base-2.6,zw,2.6);for(i=Math.floor(Math.max(z.x0,x0));i<Math.min(z.x1,x1);i++){c.beginPath();c.arc(i+.5,base-2.6,.62,3.1416,6.2832);c.fill()}
 if(z.tent){for(i=Math.floor(Math.max(z.x0,x0));i<Math.min(z.x1,x1);i++){c.fillStyle=i%2?'#fff':'#f2a7b8';c.fillRect(i,base-7,1.01,4.4)}c.fillStyle='#e58aa0';c.fillRect(z.x0,base-7.2,zw,.3)}
 for(i=Math.floor(Math.max(z.x0,x0-5)/5);i*5<Math.min(z.x1,x1);i++){var bx=i*5+1;if(bx<z.x0+.3||bx+3.6>z.x1||!solid(Math.floor(bx+1),base)||!solid(Math.floor(bx+2.5),base)||solid(Math.floor(bx+1.7),base-1))continue;backdrop(bx,base,z.kinds[((i*7)%z.kinds.length+z.kinds.length)%z.kinds.length],null,'park-decor')}}
function streetZone(z,x0,x1){var c=cx,zw=z.x1-z.x0,base=MH-2,i;if(z.x1<x0||z.x0>x1)return;c.fillStyle=z.wall;c.fillRect(z.x0,0,zw,MH);
 for(i=Math.floor(Math.max(z.x0,x0)/11)*11;i<Math.min(z.x1,x1);i+=11){if(i<z.x0)continue;c.fillStyle='rgba(255,255,255,.85)';c.beginPath();c.ellipse(i+3,3+(i%3)*.9,1.5,.42,0,0,6.2832);c.ellipse(i+4.1,3.3+(i%3)*.9,1.1,.36,0,0,6.2832);c.fill()}
 var sh=ART['street-shops'],im=IMG['street-shops'];if(!im||!im.naturalWidth)return;var k=1/sh.ppt;c.globalAlpha=.62;
 for(i=Math.floor(Math.max(z.x0,x0-6)/5.4);i*5.4<Math.min(z.x1,x1);i++){var sx=i*5.4+.4,it=sh.items[((i*7)%10+10)%10];if(sx<z.x0||sx+it.w*k>z.x1)continue;if(solid(Math.floor(sx+1),base-1)||solid(Math.floor(sx+3),base-1)||!solid(Math.floor(sx+2),base))continue;c.drawImage(im,it.x,sh.H-it.h,it.w,it.h,sx,base-it.h*k,it.w*k,it.h*k)}c.globalAlpha=1}
function streetTile(t,x,y){var c=cx;
 if(t==='F')thing('crate',x+.5,y+1.02,1.04,false,'street-things');
 else if(t==='^')thing('awning',x+.5,y+1.02,1.7,false,'street-things');
 else if(t==='K'){thing('box',x+.5,y+1.02,null,false,'street-things');if(S.cp&&S.cp[0]===x+.5){c.fillStyle='#3fd16a';c.beginPath();c.arc(x+.5,y-1.6,.16,0,6.2832);c.fill();ink(.06)}}
 else thing('gate',x+.5,y+1.02,null,false,'street-things')}
function bubbleSay(t,x,y,a,placed){var c=cx;c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var w=c.measureText(t).width+.5;x=Math.max(cam+w/2+.1,Math.min(cam+vw-w/2-.1,x));y=Math.max(camY+.5,y);
 if(placed){for(var tries=0;tries<8;tries++){var hit=placed.some(function(q){return Math.abs(q[0]-x)<(q[2]+w)/2+.15&&Math.abs(q[1]-y)<.72});if(!hit)break;y-=.74;if(y<camY+.5){y+=.74*(tries+2)}}placed.push([x,y,w])}
 c.globalAlpha=a;c.fillStyle='#fff';rr(x-w/2,y-.3,w,.6,.22);c.fill();ink(.07);c.fillStyle=INK;c.fillText(t,x,y+.02);c.globalAlpha=1}
function draw(){var c=cx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#20222b';c.fillRect(0,0,W,H);
 cam=bcx;camY=bcy;var snap=calm||S.mode==='ready',want=Math.max(0,Math.min(MW-vw,P.x-vw*(P.f>0?.36:.5))),wy=Math.max(0,Math.min(MH-VIEW,P.y-VIEW*.68));cam+=(want-cam)*(snap?1:.1);camY+=(wy-camY)*(snap?1:.07);
 bcx=cam;bcy=camY;if(!look){lookX*=.8;lookY*=.8;if(Math.abs(lookX)<.02)lookX=0;if(Math.abs(lookY)<.02)lookY=0}cam=Math.max(0,Math.min(MW-vw,cam+lookX));camY=Math.max(0,Math.min(MH-VIEW,camY+lookY));
 if(S.shake>0){S.shake-=1/60;if(!calm){cam+=(Math.random()-.5)*S.shake*.5;camY+=(Math.random()-.5)*S.shake*.35}}
 c.save();c.beginPath();c.rect(0,sceneY,W,sceneH);c.clip();c.translate(0,sceneY);c.scale(u,u);c.translate(-cam,-camY);
 var x0=Math.floor(cam)-1,x1=Math.ceil(cam+vw)+1,x,y,t;
 // the wall, with windows on the sky
 L.zones.concat(L.upstairs?[L.upstairs]:[]).forEach(function(z,zi){if(family){familyZone(z,x0,x1);return}if(street){streetZone(z,x0,x1);return}if(party){partyZone(z,x0,x1);return}if(z.x1<x0||z.x0>x1)return;var up=z===L.upstairs,zy0=0,zy1=up?9:MH,zw=z.x1-z.x0;c.fillStyle=z.wall;c.fillRect(z.x0,zy0,zw,zy1-zy0);c.fillStyle=z.dado;c.fillRect(z.x0,zy1-(up?2.8:4.8),zw,2.8);c.fillStyle=z.rail;c.fillRect(z.x0,zy1-(up?2.88:4.88),zw,.12);
  if(!up&&z.x0>0){c.fillStyle=z.rail;c.fillRect(z.x0-.3,0,.6,MH);c.fillStyle='rgba(255,255,255,.25)';c.fillRect(z.x0-.3,0,.12,MH)}});
 // the office beyond: faded furniture standing against the wall. It stays put (par=0): Barry found it sliding behind the floor distracting.
 var par=0;c.save();c.translate(par,0);if(office)for(var bi=Math.floor((x0-par)/5)-1;bi<(x1-par)/5+1;bi++)[MH-2,9].forEach(function(base,st){var bx=bi*5+1.2+((bi*13+st*7)%3)*.5,wx=bx+par;if(wx<1||wx>MW-3)return;if(st===1&&!(solid(Math.floor(wx),9)&&solid(Math.floor(wx+2),9)))return;if(st===0&&!(solid(Math.floor(wx),MH-2)&&solid(Math.floor(wx+2),MH-2)))return;var z=zoneAt(wx+1,base-1);if(wx<z.x0+.4||wx+3.6>z.x1)return;backdrop(bx,base,z.kinds[(bi*7+st*3+700)%z.kinds.length],z.tones,shop?'shop-decor':null)});c.restore();
 // strip lights along each ceiling
 if(office)for(x=Math.floor(x0/6)*6+2;x<x1;x+=6){c.fillStyle='#fff8dc';c.strokeStyle='#d9c594';c.lineWidth=.05;rr(x,.25,2.2,.2,.08);c.fill();c.stroke();if(solid(x+1,10)&&!solid(x+1,11)){rr(x,11.12,2.2,.2,.08);c.fill();c.stroke()}}
 for(x=Math.floor(x0/9)*9+3;x<x1;x+=9)[1.4,MH-9.4].forEach(function(wy0,k){if(shop){if(L.laneY)return;if(k===0&&!solid(x+1,1)&&!solid(x+1,3)){var sd2=ART['shop-decor'],si2=sd2.items[5],sm2=IMG['shop-decor'];if(sm2.naturalWidth){var sw2=2.3,sh3=sw2*si2.h/si2.w;c.drawImage(sm2,si2.x,sd2.H-si2.h,si2.w,si2.h,x+.3,.25,sw2,sh3)}}return}if(!zoneAt(x+1.5,wy0+1).win)return;if(solid(x+1,Math.floor(wy0+1))||solid(x+1,Math.floor(wy0+3.4))||solid(x+1,Math.floor(wy0-.6)))return;
  c.fillStyle='#8fd3f4';rr(x,wy0,3,3.2,.12);c.fill();ink();c.fillStyle='#fff';c.beginPath();c.ellipse(x+.9+((x*7+k*3)%5)*.2,wy0+.9,.5,.2,0,0,6.2832);c.ellipse(x+1.9,wy0+1.7,.6,.22,0,0,6.2832);c.fill();c.fillStyle=INK;c.fillRect(x+1.46,wy0,.08,3.2);c.fillRect(x,wy0+1.56,3,.08);
  if(!solid(x+6,Math.floor(wy0+1))&&!solid(x+6,Math.floor(wy0+2.4))&&(Math.floor(x/9)+k)%5!==2){poster(x+6,wy0+.3,Math.floor(x/9)*2+k)}
  else if(!solid(x+6,Math.floor(wy0+1))){c.fillStyle='#fff';c.beginPath();c.arc(x+6,wy0+1,.42,0,6.2832);c.fill();ink();c.beginPath();c.moveTo(x+6,wy0+1);c.lineTo(x+6,wy0+.75);c.moveTo(x+6,wy0+1);c.lineTo(x+6.18,wy0+1.1);ink(.06)}});
 if(L.laneY){var fl='#ddd6c8',sdc=ART['shop-decor'],sim=IMG['shop-decor'],LY=L.laneY,yb=LY[LY.length-1],s0=L.shelf[0],s1=L.shelf[1];
  var shelf=function(sx0,y0,y1,k,wd){var it=sdc.items[[0,1,0,6,1,3][((k%6)+6)%6]];if(sim.naturalWidth)c.drawImage(sim,it.x,sdc.H-it.h,it.w*(wd/3.3),it.h,sx0,y0,wd,y1-y0);else{c.fillStyle='#9aa4af';c.fillRect(sx0,y0,wd,y1-y0)}};
  c.fillStyle='#cfc7b6';c.fillRect(x0,yb-5.6,x1-x0,.6);for(var bx2=Math.floor(x0/3.3)*3.3;bx2<x1;bx2+=3.3)shelf(bx2,yb-5.1,yb-1.6,Math.round(bx2/3.3)+3,3.3);
  c.fillStyle=fl;c.fillRect(x0,yb-1.6,x1-x0,MH-yb+1.6);c.fillStyle='rgba(27,27,42,.07)';for(var fx2=Math.floor(x0/2)*2;fx2<x1;fx2+=2)LY.forEach(function(yy){c.fillRect(fx2,yy-1.6,.05,2.6)});
  for(var pi=0;pi<LY.length-1;pi++){var Y=LY[pi+1];if(Y+4.4<camY||Y+1>camY+VIEW+1)continue;var open=(L.links||[]).filter(function(q){return !q.down&&q.a===pi&&q.b===pi+1});
   for(var bx3=s0;bx3+1.1<=s1+.05;bx3+=1.1){if(bx3+1.1<x0||bx3>x1)continue;if(open.some(function(q){return bx3+1.1>q.x0+.1&&bx3<q.x1-.1}))continue;var sn=Math.round((bx3-s0)/1.1),cell=Math.floor(sn/3),off=(sn%3)*1.1,it2=sdc.items[[0,1,0,6,1,3][(cell+pi*2)%6]];c.fillStyle='rgba(27,27,42,.16)';c.fillRect(bx3,Y+4.35,1.11,.28);
    if(sim.naturalWidth)c.drawImage(sim,it2.x+it2.w*off/3.3,sdc.H-it2.h,it2.w/3,it2.h,bx3,Y+1,1.11,3.4)}}
  (L.aisleSigns||[]).forEach(function(pr,ai){var top=(ai<LY.length-1?LY[ai]-6:LY[ai]-5.1)+.08;if(top+2<camY||top>camY+VIEW)return;for(var sx4=6+((ai%2)*6.5);sx4<s1-3;sx4+=13){if(sx4+4<x0||sx4>x1)continue;c.strokeStyle=INK;c.lineWidth=.05;c.beginPath();c.moveTo(sx4+.5,top-.5);c.lineTo(sx4+.5,top);c.moveTo(sx4+3.3,top-.5);c.lineTo(sx4+3.3,top);c.stroke();c.fillStyle='#1f5fbf';rr(sx4,top,3.8,1.25,.12);c.fill();ink(.07);c.fillStyle=YEL;c.beginPath();c.arc(sx4+.62,top+.62,.44,0,6.2832);c.fill();ink(.05);c.fillStyle=INK;c.font='900 .56px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(ai+1),sx4+.62,top+.65);c.fillStyle='#fff';c.font='800 .25px Montserrat,system-ui,sans-serif';c.textAlign='left';pr.forEach(function(t3,ti){c.fillText(t3,sx4+1.25,top+.3+ti*.33)})}});
  if(S.mode==='play'&&!calm&&(S.canUp||S.canDn)&&P.ground){var bo=Math.sin(T*6)*.08;c.fillStyle=YEL;c.strokeStyle=INK;c.lineWidth=.07;if(S.canUp){var ay=P.y-2.5;c.beginPath();c.moveTo(P.x,ay-.35+bo);c.lineTo(P.x+.3,ay+bo);c.lineTo(P.x-.3,ay+bo);c.closePath();c.fill();c.stroke()}if(S.canDn){var ay2=P.y+.5;c.beginPath();c.moveTo(P.x,ay2+.35-bo);c.lineTo(P.x+.3,ay2-bo);c.lineTo(P.x-.3,ay2-bo);c.closePath();c.fill();c.stroke()}}}
 (L.signs||[]).forEach(function(sg){c.font='800 .34px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var w=c.measureText(sg.t).width+.5;c.fillStyle=YEL;rr(sg.x-w/2,sg.y-.3,w,.6,.1);c.fill();ink(.07);c.fillStyle=INK;c.fillText(sg.t,sg.x,sg.y+.02)});
 // gaps in the floor are a dark stairwell
 for(x=Math.max(1,x0);x<Math.min(MW-1,x1);x++)if(tile(x,MH-2)==='.'){var pg=c.createLinearGradient(0,MH-2,0,MH);pg.addColorStop(0,family?'#6fc3ea':street?'#4a4f58':'#3a3350');pg.addColorStop(1,family?'#3f8fc0':street?'#2b2f36':'#15131f');c.fillStyle=pg;c.fillRect(x,MH-2,1.01,2.01);c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x,MH-1.4,1.01,.08);c.fillRect(x,MH-.7,1.01,.08)}
 // safety tape round the gaps
 for(x=Math.max(1,x0);x<Math.min(MW-1,x1);x++)if(tile(x,MH-2)==='.'){var lf=tile(x-1,MH-2)==='#',rt=tile(x+1,MH-2)==='#';[[lf,x],[rt,x+1]].forEach(function(q){if(!q[0])return;c.fillStyle='#ff8a1f';c.beginPath();c.moveTo(q[1]-.14,MH-2);c.lineTo(q[1]+.14,MH-2);c.lineTo(q[1]+.05,MH-2.7);c.lineTo(q[1]-.05,MH-2.7);c.closePath();c.fill();ink(.06);c.fillStyle='#fff';c.fillRect(q[1]-.08,MH-2.45,.16,.12)});
  c.fillStyle=YEL;c.fillRect(x,MH-2.62,1.01,.16);c.fillStyle=INK;for(var sx=0;sx<4;sx++){c.beginPath();c.moveTo(x+sx*.25,MH-2.62);c.lineTo(x+sx*.25+.1,MH-2.62);c.lineTo(x+sx*.25+.2,MH-2.46);c.lineTo(x+sx*.25+.1,MH-2.46);c.closePath();c.fill()}c.fillRect(x,MH-2.64,1.01,.03);c.fillRect(x,MH-2.47,1.01,.03)}
 if(family)playground(x0,x1);
 // tiles
 for(y=Math.max(0,Math.floor(camY)-1);y<Math.min(MH,Math.ceil(camY+VIEW)+2);y++)for(x=Math.max(0,x0);x<Math.min(MW,x1);x++){t=MAP[y].charAt(x);
  if(t==='B'){}
  else if(t==='h'&&shop){thing('tins',x+.5,y+1.02,null,false,'shop-things')}
  else if(t==='h'){c.fillStyle='#8a5a2b';rr(x-.45,y-1.55,1.9,.14,.06);c.fill();ink(.05);c.fillStyle='#b23a48';rr(x-.3,y-1.45,1.6,2.45,.12);c.fill();ink(.07);c.strokeStyle='rgba(27,27,42,.35)';c.lineWidth=.05;for(var fo=0;fo<4;fo++){c.beginPath();c.moveTo(x+fo*.4,y-1.35);c.lineTo(x+fo*.4-.05,y+.9);c.stroke()}}
  else if(t==='='&&family&&ghosted(x,y)){if(ghosted(x,y)===1){c.fillStyle='#b9bcc4';rr(x-.02,y,1.04,.2,.08);c.fill();ink(.06)}}
  else if(family&&'F^KD'.indexOf(t)>=0){if(t==='F')thing('crate',x+.5,y+1.02,1.04,false,'street-things');else if(t==='^')thing('trampoline',x+.5,y+1.02,null,false,'party-things');else if(t==='D')thing('gate',x+.5,y+1.02,null,false,'park-things');else{thing('loo',x+.5,y+1.02,null,false,'park-things');if(S.cp&&S.cp[0]===x+.5){c.fillStyle='#3fd16a';c.beginPath();c.arc(x+.5,y-1.75,.16,0,6.2832);c.fill();ink(.06)}}}
  else if(street&&'F^KD'.indexOf(t)>=0){streetTile(t,x,y)}
  else if(t==='L'){var on=!isDark(zoneAt(x,y));if(on){var lg=c.createRadialGradient(x+.5,y+.35,0,x+.5,y+.35,.9);lg.addColorStop(0,'rgba(250,208,12,.55)');lg.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=lg;c.fillRect(x-.5,y-.6,2,2)}thing('switch',x+.5,y+.72,null,false,'party-things')}
  else if(t==='F'){if(shop)thing('crates',x+.5,y+1.02,1.06,false,'shop-things');else thing('cabinet',x+.5,y+1.02,1.04)}
  else if(t==='^'&&party){var zn2=zoneAt(x,y).name;thing(zn2==='The Garden'?'trampoline':zn2==='The Coat Bedroom'?'bed':'sofa',x+.5,y+1.02,null,false,'party-things')}
  else if(t==='^'){thing('chair',x+.5,y+1.02,1.45)}
  else if(t==='D'){if(party)thing('gate',x+.5,y+1.02,null,false,'party-things');else if(shop)thing(L.laneY?'selfcheck':'exit',x+.5,y+1.02,null,false,'shop-things');else thing('exit',x+.5,y+1.02)}
  else if(t==='K'){var gy2=party&&y>MH-4;if(party)thing(gy2?'cupboard':'engaged',x+(gy2?-.6:.5),y+1.02,null,false,'party-things');else if(shop&&L.laneY){var dof=L.laneY.indexOf(y+1)===L.laneY.length-1?1.58:2.56;thing('staff',x+.5,y+1.02-dof,2.05,false,'shop-things');c.fillStyle=YEL;c.globalAlpha=.55;rr(x-.2,y+.78,1.4,.2,.1);c.fill();c.globalAlpha=1}else if(shop)thing('staff',x+.5,y+1.02,null,false,'shop-things');else thing('quiet',x+.5,y+1.02);if(S.cp&&S.cp[0]===x+.5){c.fillStyle='#3fd16a';c.beginPath();c.arc(x+.5,y-(gy2?.2:1.6),.16,0,6.2832);c.fill();ink(.06)}}
  else if(t==='k'){var on=S.cp&&S.cp[0]===x+.5;c.fillStyle='#3d5a8c';rr(x-.1,y-1.1,1.2,2.1,.08);c.fill();ink();c.fillStyle=on?'#ffe9a8':'#5b7db8';rr(x+.02,y-.98,.96,1.98,.05);c.fill();ink(.05);c.fillStyle=INK;c.font='800 .2px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('QUIET',x+.5,y-.5);c.fillText('ROOM',x+.5,y-.25);c.fillStyle=on?'#3fa76a':'#d23b3b';c.beginPath();c.arc(x+.5,y+.25,.12,0,6.2832);c.fill();ink(.05)}
  else if(t==='#'&&L.laneY){var isFloor=y>=MH-2||x===0||x===MW-1||L.laneY.indexOf(y)>=0;if(isFloor){c.fillStyle='#ddd6c8';c.fillRect(x,y,1.01,1.01)}else{c.fillStyle='#b3202a';c.fillRect(x+.44,y,.12,1.01);if(L.laneY.indexOf(y+1)>=0||(y%3===0&&L.laneY.indexOf(y)<0)){c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(x+.5,y+1,.3,.08,0,0,6.2832);c.fill();c.fillStyle='#c9ccd3';rr(x+.42,y+.1,.16,.9,.05);c.fill();ink(.05);c.fillStyle='#8d939c';c.beginPath();c.ellipse(x+.5,y+.98,.24,.07,0,0,6.2832);c.fill();ink(.04);c.fillStyle=YEL;c.beginPath();c.arc(x+.5,y+.1,.13,0,6.2832);c.fill();ink(.04)}}}
  else if(t==='#'){var under=tile(x,y+1)!=='#'&&y<MH-1;if(under){c.fillStyle=INK;c.fillRect(x,y+.97,1.01,.07)}var topRow=tile(x,y-1)!=='#',th=TH,sn=L.stone;if(family&&sn&&x>=sn[0]&&x<=sn[1]&&y>=sn[2]&&y<=sn[3])th={a:'#c9ccd3',b:'#aeb2bb',c:'#e4e6ea'};c.fillStyle=topRow?th.a:th.b;c.fillRect(x,y,1.01,1.01);if(under){c.fillStyle=INK;c.fillRect(x,y+.96,1.01,.08)}if(topRow){c.fillStyle=th.c;c.fillRect(x,y,1.01,.16);c.fillStyle=INK;c.fillRect(x,y-.04,1.01,.08)}
   if(!solid(x-1,y)&&x>0){c.fillStyle=INK;c.fillRect(x-.04,y,.08,1.01)}if(!solid(x+1,y)&&x<MW-1){c.fillStyle=INK;c.fillRect(x+.96,y,.08,1.01)}}
  else if(t==='F'){c.fillStyle='#9fb2d1';rr(x+.03,y+.03,.94,.97,.05);c.fill();ink();c.fillStyle='#7f93b5';rr(x+.14,y+.16,.72,.3,.04);c.fill();ink(.05);rr(x+.14,y+.58,.72,.3,.04);c.fill();ink(.05);c.fillStyle=INK;c.fillRect(x+.4,y+.28,.2,.06);c.fillRect(x+.4,y+.7,.2,.06)}
  else if(t==='='){c.fillStyle='#d9964f';rr(x-.02,y,1.04,.3,.04);c.fill();c.fillStyle=INK;c.fillRect(x-.02,y-.04,1.04,.08);c.fillRect(x-.02,y+.26,1.04,.08);if(tile(x-1,y)!=='=')c.fillRect(x-.04,y,.08,.3);if(tile(x+1,y)!=='=')c.fillRect(x+.96,y,.08,.3);
   if(tile(x-1,y)!=='='||tile(x+1,y)!=='='){c.fillStyle='#8a5a2b';c.beginPath();var bx=tile(x-1,y)!=='='?x+.25:x+.75;c.moveTo(bx-.12,y+.3);c.lineTo(bx+.12,y+.3);c.lineTo(bx,y+.75);c.closePath();c.fill();ink(.05)}}
  else if(t==='^'){c.fillStyle=INK;c.fillRect(x+.46,y+.55,.08,.35);c.fillRect(x+.15,y+.88,.7,.08);c.fillStyle='#ff5a4f';rr(x+.08,y+.3,.84,.28,.12);c.fill();ink();rr(x+.02,y-.25,.2,.6,.08);c.fill();ink();c.fillStyle='#fff';c.font='800 .28px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('▲',x+.52,y+.44)}
  else if(t==='D'){c.fillStyle='#2f7d4f';rr(x-.1,y-1.1,1.2,2.1,.08);c.fill();ink();c.fillStyle='#3fa76a';rr(x+.02,y-.98,.96,1.98,.05);c.fill();ink(.05);c.fillStyle=YEL;c.beginPath();c.arc(x+.78,y+.1,.07,0,6.2832);c.fill();ink(.04);
   c.fillStyle='#fff';rr(x+.5,y+.2,.34,.55,.06);c.fill();ink(.05);c.fillStyle='#d23b3b';c.font='800 .13px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('DO',x+.67,y+.38);c.fillText('NOT',x+.67,y+.52)}}
 // things to collect
 items.forEach(function(it){if(it.got||it.x<x0||it.x>x1)return;if(it.k==='g'){var gn=L.list[L.laneY.indexOf(Math.round(it.y+.5))]||'?',gb=it.y-.1+(calm?0:Math.sin(T*3+it.x)*.08),gg=c.createRadialGradient(it.x,gb,0,it.x,gb,1.2);gg.addColorStop(0,'rgba(250,208,12,.8)');gg.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=gg;c.beginPath();c.arc(it.x,gb,1.2,0,6.2832);c.fill();c.fillStyle='#fff';rr(it.x-.62,gb-.42,1.24,.84,.12);c.fill();ink(.07);c.fillStyle=INK;c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(gn,it.x,gb+.02);return}
  if(it.k==='e'){var kb=it.y+(calm?0:Math.sin(T*3+it.x*1.3)*.07),KA=ART.key,kim=IMG.key,kfr=calm?0:Math.floor(T/.13+it.x*1.7)%4,ksz=.86;if(kim&&kim.naturalWidth)c.drawImage(kim,kfr*KA.w,0,KA.w,KA.h,it.x-ksz/2,kb-ksz/2,ksz,ksz);return}
  var up=it.k!=='o',by=it.y+(calm?0:Math.sin(T*(up?4:3)+it.x)*(up?.14:.06));
  if(up){var pu=calm?.5:.5+.5*Math.sin(T*5+it.x),hg=c.createRadialGradient(it.x,by,0,it.x,by,.75+pu*.2);hg.addColorStop(0,'rgba(250,208,12,.75)');hg.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=hg;c.beginPath();c.arc(it.x,by,1,0,6.2832);c.fill();
   if(!calm)for(var sp=0;sp<4;sp++){var sa=T*2.2+sp*1.571+it.x,sx2=it.x+Math.cos(sa)*.62,sy2=by+Math.sin(sa)*.62;c.fillStyle='#fff';c.beginPath();c.moveTo(sx2,sy2-.12);c.lineTo(sx2+.04,sy2-.04);c.lineTo(sx2+.12,sy2);c.lineTo(sx2+.04,sy2+.04);c.lineTo(sx2,sy2+.12);c.lineTo(sx2-.04,sy2+.04);c.lineTo(sx2-.12,sy2);c.lineTo(sx2-.04,sy2-.04);c.closePath();c.fill();ink(.035)}}
  if(it.k==='a')balloons(it.x,by+.3,1.15);
  else if(it.k==='b')babyPic(it.x,by+.2,1);
  else if(it.k==='t'&&family)thing('flask',it.x,by+.55,1,false,'park-things');
  else if(it.k==='t'&&!party)thing('tea',it.x,by+.5,.8);
  else if(it.k==='t')tissueBox(it.x,by+.45,1.5);
  else if(it.k==='f')thing('plate',it.x,by+.42,1.15,false,'party-things');
  else if(it.k==='u')thing('brolly',it.x,by+.6,1.1,false,'street-things');
  else if(it.k==='c')thing('coffee',it.x,by+.48);else if(it.k==='m')thing('phone',it.x,by+.48);
  else if(it.k==='N'){var HA=ART.hanger,him=IMG.hanger,hf=calm?1:[0,1,2,1][Math.floor(T/.28+it.x)%4],hz=1.25;if(him&&him.naturalWidth)c.drawImage(him,hf*HA.w,0,HA.w,HA.h,it.x-hz/2,by+.05-hz/2,hz,hz)}
  else if(it.k==='o'&&party)thing('punch',it.x,by+.5,.72,false,'party-things');
  else if(it.k==='o')thing('tea',it.x,by+.46,ART['flat-things'].items.tea.w/PPT*1.4);else thing(it.k==='N'?'note':'phones',it.x,by+.42,ART['flat-things'].items[it.k==='N'?'note':'phones'].w/PPT*1.15)});
 fx.forEach(function(q){c.globalAlpha=Math.min(1,q.life/.25)*.85;c.fillStyle='#fff';c.beginPath();c.arc(q.x,q.y,q.r*(1.6-q.life*1.5),0,6.2832);c.fill();c.globalAlpha=1});
 pops.forEach(function(q){var a=q.life/.6,r=(1-a)*(q.big?1.5:.8);c.globalAlpha=a;c.strokeStyle=YEL;c.lineWidth=q.big?.14:.08;c.beginPath();c.arc(q.x,q.y,.3+r,0,6.2832);c.stroke();if(!q.big){c.fillStyle=INK;c.font='800 .4px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('+',q.x,q.y-.5-(1-a)*.8)}c.globalAlpha=1});

 if(L.pram&&L.pram.x>x0-3&&L.pram.x<x1+3){var pd=ART['park-decor'],pi=pd.items[8],pim=IMG['park-decor'];if(pim.naturalWidth){var ph2=1.75,pw2=ph2*pi.w/pi.h;c.drawImage(pim,pi.x+1,pd.H-pi.h,pi.w-2,pi.h,L.pram.x-pw2/2,MH-2+.04-ph2,pw2,ph2);if(S.pramBaby)babyPic(L.pram.x-.12,MH-2-.95,.62)}}
 people.forEach(function(p){if(p.x>x0-1&&p.x<x1+1)person(p)});
 if(L.roll&&S.rollW&&S.mode==='play'){var rl=Math.max(0,(L.roll-S.rollT)/1.8),bx2=cam+vw/2,by3=camY+1.9;c.fillStyle='#e0303a';rr(bx2-3.1,by3-.38,6.2,.76,.16);c.fill();ink(.08);c.fillStyle='#fff';c.font='800 .36px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('ROLL CALL: HOOD UP!',bx2,by3-.02);c.fillStyle=YEL;c.fillRect(bx2-2.9,by3+.24,5.8*rl,.08)}
 movers.forEach(function(m){if(m.sw)return;if(!m.trolley){thing('bus',m.x,MH-2+.02,m.w+.25,false,'street-things');return}
  thing('trolley',m.x-.12,MH-2+.03,2.35,false,'shop-things')});
 (L.props||[]).forEach(function(q){if(q.x>x0-3&&q.x<x1+3)thing(q.n,q.x,MH-2+.03,null,!!q.flip,'shop-things')});
 bikes.forEach(function(b){c.fillStyle='rgba(255,255,255,.35)';c.fillRect(b.x0,MH-2-.02,b.x1-b.x0,.1);c.fillStyle='#3fa76a';c.fillRect(b.x0,MH-2+.08,b.x1-b.x0,.3);var due=b.x===null&&b.every-b.t<1.1;var gx3=b.x1+.4,gy3=MH-2-2.75,lit=due||b.x!==null,fl2=lit&&!calm&&Math.floor(T*5)%2;c.fillStyle=INK;c.fillRect(gx3-.05,gy3,.1,2.75);c.globalAlpha=lit?1:.45;c.fillStyle=fl2?'#fff':YEL;c.beginPath();c.moveTo(gx3,gy3-.72);c.lineTo(gx3+.72,gy3+.5);c.lineTo(gx3-.72,gy3+.5);c.closePath();c.fill();c.strokeStyle='#e0303a';c.lineWidth=.13;c.lineJoin='round';c.stroke();
  c.strokeStyle=INK;c.lineWidth=.055;c.beginPath();c.arc(gx3-.22,gy3+.22,.14,0,6.2832);c.moveTo(gx3+.36,gy3+.22);c.arc(gx3+.22,gy3+.22,.14,0,6.2832);c.moveTo(gx3-.22,gy3+.22);c.lineTo(gx3-.06,gy3-.04);c.lineTo(gx3+.16,gy3-.04);c.lineTo(gx3+.22,gy3+.22);c.moveTo(gx3-.06,gy3-.04);c.lineTo(gx3+.02,gy3+.22);c.lineTo(gx3+.16,gy3-.04);c.moveTo(gx3-.12,gy3-.1);c.lineTo(gx3,gy3-.1);c.moveTo(gx3+.16,gy3-.04);c.lineTo(gx3+.14,gy3-.16);c.lineTo(gx3+.24,gy3-.16);c.stroke();c.globalAlpha=1;
  if(lit&&!S.seenB&&Math.abs(P.x-b.x1)<16&&S.mode==='play'){S.seenB=true;info('CYCLE LANE','The green strip is a cycle lane. When the sign flashes, a cyclist is coming: jump, or step off the green.')}
  if(b.x!==null)sprite('street-bike',Math.floor(T/.12)%2,b.x,MH-2+.03,true,1/PPT)});
 bubbles.forEach(function(b){if(!street){thing('bubble',b.x,b.y+.42,null,b.f>0);return}
  var wob=calm?0:Math.sin(T*9+b.x)*.07,nx=b.x,ny=b.y+wob;c.fillStyle='#7a2fd6';c.strokeStyle=INK;c.lineWidth=.06;
  c.beginPath();c.ellipse(nx-.2,ny+.2,.15,.11,-.4,0,6.2832);c.fill();c.stroke();c.beginPath();c.ellipse(nx+.22,ny+.12,.15,.11,-.4,0,6.2832);c.fill();c.stroke();
  c.lineWidth=.07;c.beginPath();c.moveTo(nx-.07,ny+.18);c.lineTo(nx-.07,ny-.3);c.moveTo(nx+.35,ny+.1);c.lineTo(nx+.35,ny-.38);c.stroke();c.lineWidth=.13;c.beginPath();c.moveTo(nx-.07,ny-.28);c.lineTo(nx+.35,ny-.36);c.stroke()});
 // dark rooms: you cannot see the floor, and nobody can see you. The light switches and Hoodini stay visible.
 if(party)L.zones.forEach(function(z){if(!isDark(z)||z.x1<x0||z.x0>x1)return;c.fillStyle='rgba(10,10,22,.9)';c.fillRect(z.x0,z.y0,z.x1-z.x0,z.y1-z.y0);c.fillStyle='rgba(10,10,22,.96)';c.fillRect(z.x0,z.y1,z.x1-z.x0,2);
  for(var ly=z.y0;ly<z.y1;ly++)for(var lx=Math.max(z.x0,x0);lx<Math.min(z.x1,x1);lx++)if(tile(lx,ly)==='L'){var gl=c.createRadialGradient(lx+.5,ly+.3,0,lx+.5,ly+.3,1.1);gl.addColorStop(0,'rgba(250,208,12,.8)');gl.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=gl;c.fillRect(lx-.7,ly-.9,2.4,2.4);thing('switch',lx+.5,ly+.72,null,false,'party-things')}});
 if(party)people.forEach(function(q){if(q.k!=='C'||!q.lost||q.x<x0||q.x>x1)return;c.globalAlpha=.55;person(q);c.globalAlpha=1;c.fillStyle='#fff';c.beginPath();c.ellipse(q.x,q.y-2.45,.3,.24,0,0,6.2832);c.fill();ink(.06);c.fillStyle=INK;c.font='800 .34px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('?',q.x,q.y-2.43)});
 if(L.torch)people.forEach(function(q){if(q.k!=='C'||!isDark(zoneAt(q.x,q.y-.5)))return;var tg=c.createLinearGradient(q.x,0,q.x+q.f*5,0);tg.addColorStop(0,'rgba(255,240,170,.55)');tg.addColorStop(1,'rgba(255,240,170,0)');c.fillStyle=tg;c.beginPath();c.moveTo(q.x+q.f*.3,q.y-1.1);c.lineTo(q.x+q.f*5,q.y-2.4);c.lineTo(q.x+q.f*5,q.y+.05);c.closePath();c.fill();person(q)});
 // you
 var k=1.7/HERO.pph,f=(P.hood||P.slide)?2:S.mode==='won'?3:P.cringeT>0?11:!P.ground?(P.vy<2?8:9):P.landT>0?10:(Math.abs(P.vx)>.5||P.lo)?4+Math.floor(P.walkT/.085)%4:0;
 c.fillStyle='rgba(27,27,42,.2)';c.beginPath();c.ellipse(P.x,Math.min(P.y,MH-2)+.02,.4,.08,0,0,6.2832);if(P.ground)c.fill();
 if(P.phones>0){c.strokeStyle='#7a5cff';c.lineWidth=.07;c.globalAlpha=.5+.3*Math.sin(T*4);c.beginPath();c.arc(P.x,P.y-.85,1.05,0,6.2832);c.stroke();c.globalAlpha=1}
 var hang=!P.ground&&(P.balloons||P.float)&&!P.slide&&!(P.inv>1.15)&&S.mode!=='won',fy=P.y-2.1;
 if(P.balloons)balloons(hang?P.x:P.x-P.f*.15,hang?fy-.45:P.y-2.25,1.05);
 if(P.float)thing('brolly',hang?P.x:P.x+P.f*.22,hang?fy+.12:P.y-.75,1.9,false,'street-things');
 if(P.phones>0&&!calm)for(var mn=0;mn<3;mn++){var ma=T*3+mn*2.1;c.fillStyle='#7a5cff';c.font='800 .5px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('♪',P.x+Math.cos(ma)*.95,P.y-1+Math.sin(ma)*.7)}
 var HG=ART['hero-hang'],it2=P.idleT||0,sn='hero',fr=f,rot=0,al=P.hid?.38:P.inv>0?.55:1,cp=false,fl=P.f,bob=0,carry=P.plate||P.baby>0||P.tissues,legs=-1,fy2=Math.floor(P.y+.1);
 var sup=function(x){var t=tile(Math.floor(x),fy2);return solid(Math.floor(x),fy2)||t==='='||t==='B'},tee=(P.ground&&!P.on&&S.mode==='play'&&sup(P.x))?(!sup(P.x+.42)?1:!sup(P.x-.42)?-1:0):0;
 if(P.slide){sn='hero-extra';fr=1;rot=.3}
 else if(P.callT>0&&P.ground){sn='hero-extra';fr=0;if(f>=4&&f<=7)legs=f}
 else if(P.hood&&P.ground){sn='hero-hood';fr=Math.abs(P.vx)>.2?Math.floor((P.hoodW||0)/.2)%4:1;al=.88}
 else if(S.mode==='won'){sn='hero-extra';fr=5}
 else if(P.cringeT>0){sn='hero-extra';fr=2}
 else if(P.skidT>0&&P.ground&&!carry){sn='hero-more';fr=4}
 else if(P.ground&&carry&&f>=4&&f<=7){sn='hero-more';fr=2;cp=true;legs=f}
 else if(f===0&&tee&&!carry){sn='hero-more';fr=calm?0:Math.floor(T/.36)%2;fl=tee}
 else if(f===0&&P.wetT>0){sn='hero-extra';fr=3}
 else if(f===0&&carry){sn='hero-extra';fr=4;cp=true}
 else if(f===0&&look&&!carry){sn='hero-more';fr=5}
 else if(f===0&&it2>4&&P.inv<=0){sn='hero-idle';fr=it2<7?Math.floor(it2/.28)%2:it2<10?2:it2<12.5?3:it2<16?4:5}
 if(hang&&IMG['hero-hang'].naturalWidth){var hfr=(P.balloons&&jumpKey()&&P.lift>0)?3:Math.abs(P.vx)>2.5?2:(calm?0:Math.floor(T/.45)%2);c.save();c.translate(P.x,fy);c.scale(P.f,1);c.imageSmoothingQuality='high';c.drawImage(IMG['hero-hang'],hfr*HG.w,0,HG.w,HG.h,-HG.ax*k,-HG.top*k,HG.w*k,HG.h*k);c.restore()}
 else if(ready){var SA=ART[sn],sim=IMG[sn];if(!sim||!sim.naturalWidth){SA=HERO;sim=img;fr=f}if(sim.naturalWidth){var sqv=calm?0:(P.sq||0);c.save();c.translate(P.x,P.y+.04-bob+(P.lo||0));c.scale(fl*(1-sqv*.1),1+sqv*.14);if(rot)c.rotate(rot);c.globalAlpha=al;c.imageSmoothingQuality='high';if(legs>=0&&img.naturalWidth){var cut=.63;c.save();c.beginPath();c.rect(-2,-cut,4,cut+.3);c.clip();c.drawImage(img,legs*HERO.w,0,HERO.w,HERO.h,-HERO.ax*k,-HERO.base*k,HERO.w*k,HERO.h*k);c.restore();c.beginPath();c.rect(-2,-3,4,3-cut);c.clip()}c.drawImage(sim,fr*SA.w,0,SA.w,SA.h,-SA.ax*k,-SA.base*k,SA.w*k,SA.h*k);c.restore();c.globalAlpha=1}}

 if(P.plate)thing('plate',P.x+P.f*(cp?.68:.45),P.y-(cp?.93:.72),.7,false,'party-things');
 if(P.tissues&&family)thing('flask',P.x+P.f*(cp?.66:.45),P.y-(cp?.96:.55),.6,P.f<0,'park-things');else if(P.tissues&&!party)thing('tea',P.x+P.f*.42,P.y-.6,.5);else if(P.tissues)tissueBox(P.x+P.f*(cp?.68:-.4),P.y-(cp?.82:.45),.9);
 if(P.baby>0)babyPic(P.x+P.f*(cp?.66:.35),P.y-(cp?1.2:.85),.8);
 if(P.fast>0&&!calm){c.strokeStyle='rgba(27,27,42,.35)';c.lineWidth=.06;for(var q2=0;q2<3;q2++){c.beginPath();c.moveTo(P.x-P.f*(.5+q2*.12),P.y-.4-q2*.4);c.lineTo(P.x-P.f*(1+q2*.12),P.y-.4-q2*.4);c.stroke()}}
 if(P.hood){c.fillStyle='rgba(27,27,42,.5)';rr(P.x-.5,P.y-1.75,1,.14,.07);c.fill();c.fillStyle=YEL;rr(P.x-.5,P.y-1.75,Math.max(0,P.hoodT/HOODMAX),.14,.07);c.fill()}
 var placed=[];says.forEach(function(s){bubbleSay(s.t,s.x,s.y,Math.min(1,s.life*2),placed)});
 c.restore();if(titleOn)return;
 if(S.wet>0){var rw=S.wet;c.save();c.beginPath();c.rect(0,sceneY,W,sceneH);c.clip();c.fillStyle='rgba(30,40,70,'+(.24*rw)+')';c.fillRect(0,sceneY,W,sceneH);c.strokeStyle='rgba(215,230,255,'+(.55*rw)+')';c.lineWidth=1.6;c.lineCap='round';c.beginPath();
  var gy=sceneY+(MH-2-camY)*u,rt=calm?0:T;for(var ri2=0;ri2<90;ri2++){var rx=((ri2*137.5+rt*-260-cam*u*.6)%(W+80)+W+80)%(W+80)-40,ry=sceneY+((ri2*71.3+rt*(760+ri2%5*40))%sceneH);c.moveTo(rx,ry);c.lineTo(rx-7,ry+20)}c.stroke();
  if(!calm){c.strokeStyle='rgba(215,230,255,'+(.6*rw)+')';c.lineWidth=1.3;for(var si=0;si<14;si++){var sp2=(T*2.2+si*.37)%1,sx3=((si*211.7+Math.floor(T*2.2+si*.37)*97-cam*u)%W+W)%W;c.beginPath();c.ellipse(sx3,gy+3,2+sp2*9,1+sp2*2.5,0,3.1416,6.2832);c.stroke()}}c.restore()}
 // the display: battery, tea and notes
 var hy=sceneY+10,hs=Math.min(1,(W-200)/520),low=S.batt<=.26,kok=S.keys>=need(),kp=S.keyPop>0?(S.keyPop-=1/60,1+S.keyPop*1.2):1;c.save();c.translate(W-12,hy);c.scale(hs,hs);c.translate(-80,0);
 c.fillStyle='rgba(27,27,42,.9)';rr(-262,0,262,50,12);c.fill();c.strokeStyle=low&&!calm&&Math.floor(T*4)%2?'#ff6a4f':YEL;c.lineWidth=3;c.stroke();
 c.fillStyle=CREAM;c.font='800 10px Montserrat,system-ui,sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText('SOCIAL BATTERY',-248,12);c.textAlign='right';c.fillStyle=YEL;c.fillText('SIGNS '+S.notes+'/3',-14,12);
 c.strokeStyle=CREAM;c.lineWidth=2.5;rr(-248,21,224,21,6);c.stroke();c.fillStyle=CREAM;rr(-22,27,6,9,2);c.fill();c.fillStyle=S.glow>0?'#fff':S.batt>.5?YEL:S.batt>.26?'#ff9f1c':'#ff4f3a';var bw=216*Math.max(0,S.batt);if(bw>0){rr(-244,25,bw,13,3);c.fill()}
 c.fillStyle='rgba(27,27,42,.9)';for(var qd=1;qd<4;qd++)c.fillRect(-244+54*qd-1,25,2,13);
 c.fillStyle=kok?'rgba(47,125,79,.95)':'rgba(27,27,42,.9)';rr(-430,0,158,50,12);c.fill();c.strokeStyle=YEL;c.lineWidth=3;c.stroke();
 if(IMG.key&&IMG.key.naturalWidth){var kis=38*kp;c.drawImage(IMG.key,0,0,ART.key.w,ART.key.h,-404-kis/2,25-kis/2,kis,kis)}
 c.fillStyle=YEL;c.textAlign='left';c.font='900 '+Math.round(26*kp)+'px Montserrat,system-ui,sans-serif';var kt=String(S.keys);c.fillText(kt,-384,26);var kw2=c.measureText(kt).width;c.font='800 13px Montserrat,system-ui,sans-serif';c.fillStyle=CREAM;c.fillText('/ '+(S.keyT||0),-380+kw2,30);
 c.font='800 9px Montserrat,system-ui,sans-serif';c.textAlign='right';c.fillStyle=kok?'#fff':CREAM;c.fillText(kok?'UNLOCKED':'NEED '+need(),-282,12);
 if(S.gyAt!=null){var ga=T-S.gyAt,glv=S.gyLv||1,gD=glv>2?3:glv>1?2.4:1.9,GH=ART['gary-heads'],gim=IMG['gary-heads'];if(ga>=0&&ga<gD&&gim&&gim.naturalWidth){var gs=Math.min(1,ga/.16,(gD-ga)/.16),gr=34,gcx=42,gcy=30,gf=calm?(glv>2?4:glv>1?3:1):glv===1?(ga<.55?0:1):glv===2?(ga<.35?1:ga<.7?2:[3,2][Math.floor(ga/.22)%2]):[3,4,5,4][Math.floor(ga/.17)%4],bn=calm||glv<2?0:Math.abs(Math.sin(ga*(glv>2?20:13)))*(glv>2?3:1.5);
   c.save();c.translate(gcx,gcy);c.scale(gs,gs);c.fillStyle=glv>2?'#e0303a':YEL;c.beginPath();c.arc(0,0,gr+3,0,6.2832);c.fill();c.fillStyle='#fde8b3';c.beginPath();c.arc(0,0,gr,0,6.2832);c.fill();c.save();c.beginPath();c.arc(0,0,gr,0,6.2832);c.clip();var ghh=94,ghw=ghh*GH.w/GH.h;c.drawImage(gim,gf*GH.w,0,GH.w,GH.h,-ghw/2,gr+9-ghh-bn,ghw,ghh);c.restore();c.strokeStyle='#1b1b2a';c.lineWidth=2.5;c.beginPath();c.arc(0,0,gr+3,0,6.2832);c.stroke();c.restore()}}
 c.restore();
 var zn=zoneAt(P.x,P.y-.5);if(S.zone!==zn.name){S.zone=zn.name;S.zoneT=S.mode==='ready'?0:2.6}if(S.zoneT>0){var za=Math.min(1,S.zoneT*2,(2.6-S.zoneT)*4);c.globalAlpha=Math.max(0,za);c.font='800 '+(tall?15:18)+'px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var zt=zn.name.toUpperCase(),zw2=c.measureText(zt).width+36;c.fillStyle='rgba(27,27,42,.82)';rr(W/2-zw2/2,sceneY+sceneH*.16,zw2,36,10);c.fill();c.fillStyle=YEL;c.fillText(zt,W/2,sceneY+sceneH*.16+19);c.globalAlpha=1}
 if(S.info){var ia=Math.min(1,S.info.t*2,(4-S.info.t)*5),iy=sceneY+sceneH*.3,ih=tall?62:66,ft=4,fb=14;c.globalAlpha=Math.max(0,ia);c.textAlign='center';c.textBaseline='middle';c.font='600 '+(tall?11:13)+'px Montserrat,system-ui,sans-serif';var iw=Math.min(W-24,Math.max(c.measureText(S.info.b).width+44,200)),ix=W/2-iw/2;
  c.fillStyle='rgba(0,0,0,.35)';rr(ix+2,iy+5,iw,ih,13);c.fill();c.fillStyle=YEL;rr(ix,iy,iw,ih,13);c.fill();c.fillStyle='#1a1a18';rr(ix+ft,iy+ft,iw-ft*2,ih-ft-fb,8);c.fill();
  var dw=fb*3.2,dh=fb*.56,dx0=ix+iw-ft-fb*.12-dw,dy0=iy+ih-fb*.22-dh;rr(dx0,dy0,dw,dh,dh/2);c.fill();c.fillStyle=YEL;[.21,.5,.79].forEach(function(q){c.beginPath();c.arc(dx0+dw*q,dy0+dh/2,fb*.135,0,6.2832);c.fill()});
  c.fillStyle=YEL;c.font='800 '+(tall?13:15)+'px Montserrat,system-ui,sans-serif';c.fillText(S.info.a,W/2,iy+ft+15);c.fillStyle='#f6efe0';c.font='600 '+(tall?11:13)+'px Montserrat,system-ui,sans-serif';c.fillText(S.info.b,W/2,iy+ft+(tall?33:35),iw-24);c.globalAlpha=1}
 var ups=[];if(L.list)ups.push('LIST '+(S.list||0)+'/'+L.list.length);if(P.fast>0)ups.push('COFFEE '+Math.ceil(P.fast));if(P.phones>0)ups.push('HEADPHONES '+Math.ceil(P.phones));if(P.shield)ups.push('PHONE: 1 FREE PASS');if(P.plate)ups.push('PLATE: FEEDS '+(P.plateN||1)+' MORE '+((P.plateN||1)>1?'GROUPS':'GROUP'));if(P.tissues)ups.push(L.toll.item);if(P.baby>0)ups.push('BABY '+Math.ceil(P.baby));if(P.balloons)ups.push('BALLOONS: HOLD A TO RISE');if(P.brolly)ups.push('UMBRELLA: HOLD A TO FLOAT');if(ups.length){c.font='800 11px Montserrat,system-ui,sans-serif';c.textAlign='right';c.textBaseline='middle';var ut=ups.join('  ·  '),uw=c.measureText(ut).width+18;c.fillStyle=YEL;rr(W-12-80*hs-uw,sceneY+16+50*hs,uw,22,8);c.fill();c.fillStyle='#1c1611';c.fillText(ut,W-21-80*hs,sceneY+27.5+50*hs)}
 if(look){c.font='800 12px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var lw=c.measureText('LOOKING AROUND · GAME PAUSED').width+24;c.fillStyle=YEL;rr(W/2-lw/2,sceneY+sceneH-34,lw,24,12);c.fill();c.fillStyle='#1c1611';c.fillText('LOOKING AROUND · GAME PAUSED',W/2,sceneY+sceneH-21)}
 if(!ready){c.fillStyle=CREAM;c.textAlign='center';c.font='600 14px Montserrat,system-ui,sans-serif';c.fillText('Unrolling the carpet…',W/2,sceneY+sceneH/2)}
 // the buttons, laid out like an old handheld
 if(tall){c.fillStyle='#2b2e3a';c.fillRect(0,sceneH,W,H-sceneH);c.fillStyle='#14151c';c.fillRect(0,sceneH,W,4)}
 if(S.mode==='play'||S.mode==='ready'){var o=stick||{x0:PAD.s.x,y0:PAD.s.y,v:0},sr=PAD.s.r;c.globalAlpha=tall?1:.8;c.fillStyle='#3d4152';c.beginPath();c.arc(o.x0,o.y0,sr,0,6.2832);c.fill();c.strokeStyle='#14151c';c.lineWidth=3;c.stroke();
  c.fillStyle='rgba(246,239,224,.35)';c.font='800 '+Math.round(sr*.4)+'px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('◀',o.x0-sr*.62,o.y0+1);c.fillText('▶',o.x0+sr*.62,o.y0+1);
  c.fillStyle=stick&&Math.abs(stick.v)>.18?YEL:CREAM;c.beginPath();c.arc(o.x0+o.v*sr*.6,o.y0+(L.laneY?(o.vy||0)*sr*.6:0),sr*.42,0,6.2832);c.fill();c.stroke();
  [['b','B'],['a','A']].forEach(function(q){var b=PAD[q[0]],on=!!btn[q[0]];c.fillStyle=on?YEL:'#c9364a';c.beginPath();c.arc(b.x,b.y,b.r,0,6.2832);c.fill();c.strokeStyle='#14151c';c.lineWidth=3;c.stroke();
   c.fillStyle=on?'#1c1611':CREAM;c.font='800 '+Math.round(b.r*.7)+'px Montserrat,system-ui,sans-serif';c.fillText(q[1],b.x,b.y+1);c.font='700 10px Montserrat,system-ui,sans-serif';c.fillStyle=CREAM;c.globalAlpha=.75;c.fillText(q[0]==='a'?'JUMP':'HOOD UP',b.x,b.y+b.r+12);c.globalAlpha=tall?1:.8});c.globalAlpha=1}}
var last=0,titleOn=true,titleT=0,titleLv=-1,startLv=0;function loop(now){var dt=Math.min(.033,(now-last)/1000||0);last=now;T+=dt;if(S&&S.mode==='reveal'){S.revT+=dt;var rk=Math.min(1,S.revT/2.6);rk=rk*rk*(3-2*rk);VIEW=(L.view||11)+(MH+1-(L.view||11))*rk;lay();if(S.revT>4.2)win()}
 if(!document.hidden&&ready)update(dt);if(RN||(S&&S.wet>0))rainVol(S&&S.mode==='play'&&!titleOn&&!document.hidden?(S.wet||0):0);draw();requestAnimationFrame(loop)}

// ---- thumbs and keys ----
var ptr={};
function at(e){var b=cv.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top]}
function sync(){btn={};for(var id in ptr)if(ptr[id])btn[ptr[id]]=1}
cv.addEventListener('pointerdown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;e.preventDefault();var q=at(e),hit=null;['a','b'].forEach(function(n){var p=PAD[n];if(Math.hypot(q[0]-p.x,q[1]-p.y)<p.r+18)hit=n});
 if(hit){ptr[e.pointerId]=hit;if(hit==='a')jumpQ=.12;sync()}else if(tall?q[1]<sceneH:q[1]<sceneY+sceneH*.52){if(!look)look={id:e.pointerId,x:q[0],y:q[1]}}   // a finger on the picture itself: drag to look around
 else if(q[0]<W*.55&&!stick){stick={id:e.pointerId,x0:Math.max(PAD.s.r+6,q[0]),y0:q[1],v:0};move(e)}
 try{cv.setPointerCapture(e.pointerId)}catch(_){}});
function move(e){if(look&&e.pointerId===look.id){var q=at(e);lookX=Math.max(-16,Math.min(16,lookX-(q[0]-look.x)/u));lookY=Math.max(-10,Math.min(10,lookY-(q[1]-look.y)/u));look.x=q[0];look.y=q[1];return}if(!stick||e.pointerId!==stick.id)return;stick.v=Math.max(-1,Math.min(1,(at(e)[0]-stick.x0)/(PAD.s.r*.6)));stick.vy=Math.max(-1,Math.min(1,(at(e)[1]-stick.y0)/(PAD.s.r*.6)))}
cv.addEventListener('pointermove',move);
function up(e){if(look&&e.pointerId===look.id)look=null;if(stick&&e.pointerId===stick.id)stick=null;delete ptr[e.pointerId];sync()}cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
addEventListener('keydown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;var k=e.key.length===1?e.key.toLowerCase():e.key;if(/^(Arrow(Left|Right|Up|Down)|Shift| |[adwszxik])$/.test(k)){if(!e.repeat&&(k==='z'||k===' '||k==='ArrowUp'||k==='w'))jumpQ=.12;keys[k]=1;e.preventDefault()}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k]});addEventListener('blur',function(){keys={};ptr={};btn={};stick=null;look=null});
$('pggo').addEventListener('click',function(){$('pgcard').hidden=true;cv.focus()});
var tpGary=0;(function(){var gg=$('pgtg');$('pgta').style.backgroundImage='url('+SRC+'title)';var pl=ART.presents,tl=$('pgtl');tl.style.aspectRatio=pl.W+'/'+pl.H;tl.style.backgroundImage='url('+SRC+'presents)';[gg,$('pggary')].forEach(function(gg){var GP=ART['gary-parts'],bb=document.createElement('b'),uu=document.createElement('u');[['point','gp',300,335],['torso','gt',50,355],['head','gh',57,25],['head2','gh2',49,25],['torso','gt gtf',50,355],['fist','gf',0,395]].forEach(function(q){var it=GP.items[q[0]],el=document.createElement('i'),w=it.w/GP.q,h=it.h/GP.q;el.className=q[1];el.style.left=(q[2]/8)+'%';el.style.top=(q[3]/7.3)+'%';el.style.width=(w/8)+'%';el.style.height=(h/7.3)+'%';el.style.backgroundImage='url('+SRC+'gary-parts)';el.style.backgroundSize=(GP.W/it.w*100)+'% '+(GP.H/it.h*100)+'%';el.style.backgroundPosition=(it.x/(GP.W-it.w)*100)+'% 100%';uu.appendChild(el)});bb.appendChild(uu);gg.appendChild(bb)})})();
$('pgplay').addEventListener('click',function(){titleOn=false;clearInterval(tpGary);$('pgtitle').hidden=true;load(startLv);$('pgintro').hidden=false;$('pgend').hidden=true;menu();$('pgcard').hidden=false;$('pggo').focus()});
function pause(){if(titleOn||(S.mode!=='play'&&S.mode!=='ready'))return;S.pm=S.mode;S.mode='paused';keys={};btn={};stick=null;nemPic(null);card('Paused',NAME+' is pretending to check his phone.','','Carry on')}
$('pgmenu').addEventListener('click',pause);$('pgnavb').addEventListener('click',function(){pause();$('pgnav').hidden=false;$('pgnavx').focus()});$('pgnavx').addEventListener('click',function(){$('pgnav').hidden=true});$('pgsnd').classList.toggle('off',muted);$('pgsnd').addEventListener('click',function(){muted=!muted;try{localStorage.setItem('ih_hoodini_mute',muted?'1':'0')}catch(e){}this.classList.toggle('off',muted);wake();if(!muted)sfx('tea')});addEventListener('keydown',function(e){if(e.key==='Escape'||e.key==='p'||e.key==='P')pause()});
$('pgre').addEventListener('click',function(){$('pgcard').hidden=true;load(LI);cv.focus()});$('pgtt').addEventListener('click',function(){$('pgcard').hidden=true;startLv=LI;load(LI);titleOn=true;$('pgtitle').hidden=false});
$('pgcb').addEventListener('click',function(){if(S.mode==='paused'){S.mode=S.pm;$('pgcard').hidden=true;cv.focus();return}$('pgcard').hidden=true;if(S.mode==='lost')again();else if(S.mode==='won')load(LI<LV.length-1?LI+1:LI);else reset()});
addEventListener('resize',lay);var askLv=parseInt((/[?&]level=(\d+)/.exec(location.search)||[])[1]||'0',10);if(askLv>1)unlock(Math.min(LV.length,askLv)-1);var lastLv=0;try{lastLv=parseInt(localStorage.getItem('ih_hoodini_last')||'0',10)||0}catch(e){}startLv=askLv>0?askLv-1:Math.min(lastLv,unlocked());load(startLv,true);lay();requestAnimationFrame(loop);
// Hooks for the automatic play-tests.
window.__pg={S:function(){return S},P:function(){return P},people:function(){return people},items:function(){return items},bubbles:function(){return bubbles},map:MAP,level:function(){return LI},load:load,movers:function(){return movers},bikes:function(){return bikes},tiles:function(){return MAP},ready:function(){return ready},
 look:function(){return [look,lookX,lookY,cam,camY]},sayTest:function(t,x,y){say(t,x,y)},press:function(n,on){if(n==='l'||n==='r'){stick=on?{id:-1,x0:0,y0:0,v:n==='r'?1:-1}:(stick&&stick.v===(n==='r'?1:-1)?null:stick);return}if(on){btn[n]=1;if(n==='a')jumpQ=.12}else delete btn[n]},restart:function(){reset()},step:function(n){for(var i=0;i<n;i++)update(1/60)}};
})();`;

// presents = the site's shared "Introvert Here... presents" title card ({ html, js } from worker.js), shown before the title page.
export function platformPage(page, hub, v, presents, aisles) {
  const j = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__LEVELS__", () => j(aisles ? [AISLES] : [LEVEL, STREET, PARTY, FAMILY, SHOP])).replace("__NAME__", () => j(HERO_NAME)).replace("__ART__", () => j({ hero: ART.hero, "flat-people": ART["flat-people"], "flat-movers": ART["flat-movers"], "flat-things": ART["flat-things"], "flat-decor": ART["flat-decor"], "street-people": ART["street-people"], "street-movers": ART["street-movers"], "street-bike": ART["street-bike"], "street-things": ART["street-things"], "street-shops": ART["street-shops"], "party-host": ART["party-host"], "party-dancer": ART["party-dancer"], "party-people": ART["party-people"], "party-things": ART["party-things"], "party-decor": ART["party-decor"], "party-criers": ART["party-criers"], "park-play": ART["park-play"], "park-things": ART["park-things"], "park-decor": ART["park-decor"], "park-people": ART["park-people"], "park-kid": ART["park-kid"], "park-parents": ART["park-parents"], nemesis: ART.nemesis, "hero-idle": ART["hero-idle"], "hero-hang": ART["hero-hang"], "gary-parts": ART["gary-parts"], presents: ART.presents, "hero-hood": ART["hero-hood"], "hero-extra": ART["hero-extra"], "hero-more": ART["hero-more"], "park-cast": ART["park-cast"], "park-mega": ART["park-mega"], key: ART.key, hanger: ART.hanger, "street-rain": ART["street-rain"], "shop-people": ART["shop-people"], "shop-movers": ART["shop-movers"], "shop-things": ART["shop-things"], "shop-decor": ART["shop-decor"], "shop-walkers": ART["shop-walkers"], "gary-heads": ART["gary-heads"] })).replace("__FAILS__", () => j(FAILS)).replace("__GRADES__", () => j(GRADES)).replace("__NEM__", () => j(NEMESIS_NAME)).replace("__SRC__", () => j(hub.path + "/stealth?v=" + v + "&a="));
  const opening = presents ? presents.js + "\nihPresents('hoodini',false);(function(){var t=document.getElementById('pgtitle'),o=document.getElementById('dzi');if(!o||!o.isConnected)return;t.classList.add('wait');new MutationObserver(function(){if(o.classList.contains('bye')||!o.isConnected)t.classList.remove('wait')}).observe(o,{attributes:true})})();" : "";
  return page(TITLE, `${presents ? presents.html : ""}<style>${CSS}</style><div class="pg" id="pg">
<canvas id="pgc" tabindex="0" role="img" aria-label="A side-scrolling platform game set in an office, starring ${HERO_NAME}, a small figure in a navy hoodie. Use the on-screen thumb pad to run, A to jump and B to put your hood up. On a keyboard: arrow keys to run, Z or Space to jump, X or Shift to put your hood up."></canvas>
<button type="button" class="pm" id="pgmenu" aria-label="Pause and menu"><i></i><i></i></button><button type="button" class="pm snd" id="pgsnd" aria-label="Sound on or off">♪</button><button type="button" class="pm mnu" id="pgnavb" aria-label="Site menu"><i></i><i></i><i></i></button>
<div class="nv" id="pgnav" hidden><div class="thing"><img src="/logo-ER-wide.png?v=5" alt="Introvert Here: The Escape Room"><p class="big"><a href="${hub.path}">Back to the Escape Room</a><a href="/uk/shop">Shop</a><a href="/uk/basket">Basket</a></p><p class="sml"><a href="/terms">Terms</a><a href="/returns">Returns</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a><a href="/?change=1">Change country</a></p><button class="btn" id="pgnavx" type="button">Back to the game</button></div></div>
<i class="tp-g gk" id="pggary"></i>
<div class="tp" id="pgtitle"><div class="tp-art" id="pgta" role="img" aria-label="${TITLE}"></div><i class="tp-logo" id="pgtl" role="img" aria-label="Introvert Here… presents"></i><i class="tp-g" id="pgtg"></i><p class="tp-go"><button class="btn" id="pgplay" type="button">Play</button><a href="${hub.path}">Back to the room</a></p></div>
<div class="card" id="pgcard" hidden><div class="thing">
<div id="pgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p id="pgintrop">${LEVEL.intro}</p><p class="lv" id="pglv"></p>
<details class="how"><summary>How to play</summary><ul><li><b>Left thumb</b> steers. <b>A</b> jumps: hold it to jump higher, and steer in the air.</li><li><b>B</b> is Hood Up: he pulls his drawstrings tight and shuffles along, and nobody notices him for a couple of seconds. It’s the only way through a low ceiling.</li><li><b>Touch a person or a speech bubble</b> and it costs a quarter of your social battery.</li><li><b>Drag the picture</b> to look around before you leap. The game waits while you do.</li><li><b>Power-ups glow.</b> Each one tells you what it does when you pick it up.</li><li><b>Keys</b> are what you’re here for. You need 40 to unlock the way out, and each one tops up your battery a little.</li><li><b>Quiet rooms</b> save your place. <b>Office chairs</b> bounce. Three <b>Do Not Disturb signs</b> are hidden: each one recharges your battery completely.</li></ul>
<p class="sm">Sound effects: the ♪ button turns them off. On a computer: arrow keys, Z or Space to jump, X or Shift for Hood Up.</p></details>
<p class="go"><button class="btn" id="pggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="pgend" hidden><div id="pgnem" hidden style="float:right;margin:-6px -6px 4px 8px"></div><p class="pre">Introvert Here…</p><h2 id="pgch"></h2><p id="pgcp"></p><div id="pgsheet" hidden></div><p class="sm" id="pgcs"></p>
<p class="go"><button class="btn" id="pgcb" type="button">Go again</button><button class="btn alt" id="pgre" type="button">Start level again</button><button class="btn alt" id="pgtt" type="button">Title page</button><a href="${hub.path}">Back to the room</a></p><p class="sm" id="pglvh" hidden style="margin:9px 0 5px">Or pick a level:</p><p class="lv" id="pglv2" style="margin:0"></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A platform game for introverts: get out of the office without being drawn into a conversation.", script: script + "\n" + opening });
}

// Flappy Grinder: the 11 cafe backdrops, drawn in code (pixel art with filled rectangles, no image files).
// Each scene is drawn from Roger's exterior photos: the shapes, colors and signs that make each cafe recognizable.
// draw[id](P, scroll, sec): P is the drawing kit from game.js (rect, disc, text, tile, hash), scroll is how far the run has
// travelled in pixels, sec is the clock. Layers move at different speeds (far = slow, building = medium, ground = full speed).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlappyScenes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var GY = 224;                    // top of the pavement strip

  // ---- shared pieces ----
  function sky(P, cols) {
    var h = GY / cols.length;
    for (var i = 0; i < cols.length; i++) P.rect(0, Math.floor(i * h), P.W, Math.ceil(h) + 1, cols[i]);
  }
  function cloud(P, x, y, c) { P.rect(x + 6, y, 18, 5, c); P.rect(x, y + 5, 34, 5, c); P.rect(x + 10, y - 4, 10, 5, c); }
  function clouds(P, sec, s, c) {
    P.tile(260, s * 0.06 + sec * 2, function (x, k) { cloud(P, x + P.hash(k) % 120, 22 + P.hash(k + 7) % 44, c); });
  }
  function line(P, x0, y0, x1, y1, c, t) {
    t = t || 1;
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (var i = 0; i <= n; i++) P.rect(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, t, t, c);
  }
  function brick(P, x, y, w, h, base, mortar) {
    P.rect(x, y, w, h, base);
    for (var r = 0; r * 4 < h; r++) {
      P.rect(x, y + r * 4, w, 1, mortar);
      for (var cx = x + (r % 2) * 4; cx < x + w; cx += 8) P.rect(cx, y + r * 4, 1, Math.min(4, h - r * 4), mortar);
    }
  }
  function ground(P, s, base, edge, dash) {
    P.rect(0, GY, P.W, P.H - GY, base);
    P.rect(0, GY, P.W, 3, edge);
    P.tile(28, s, function (x) { P.rect(x, GY + 9, 14, 2, dash); });
  }
  function person(P, x, y, shirt, pants) {      // 6 wide, 16 tall, feet at y + 16
    P.rect(x + 1, y, 4, 4, '#e8b894'); P.rect(x, y + 4, 6, 7, shirt); P.rect(x + 1, y + 11, 4, 5, pants || '#34424f');
  }
  // A row of low houses on the horizon (beach neighborhoods) and a row of towers (downtown).
  function houses(P, off, base, cols, roof, fill) {
    P.rect(0, base, P.W, GY - base, fill);
    P.tile(160, off, function (x, k) {
      for (var i = 0; i < 3; i++) {
        var h = 22 + P.hash(k * 3 + i) % 22, w = 38 + P.hash(k * 5 + i) % 12, bx = x + i * 52;
        P.rect(bx, base - h, w, h, cols[P.hash(k * 3 + i + 1) % cols.length]);
        P.rect(bx - 2, base - h - 3, w + 4, 4, roof);
        P.rect(bx + 6, base - h + 8, 6, 7, '#4a6275'); P.rect(bx + w - 14, base - h + 8, 6, 7, '#4a6275');
      }
    });
  }
  function towers(P, off, base, cols, win, fill) {
    P.rect(0, base, P.W, GY - base, fill);
    P.tile(150, off, function (x, k) {
      for (var i = 0; i < 4; i++) {
        var h = 36 + P.hash(k * 4 + i) % 62, w = 22 + P.hash(k * 7 + i) % 14, bx = x + i * 38;
        P.rect(bx, base - h, w, h, cols[P.hash(k * 4 + i + 3) % cols.length]);
        for (var wy = base - h + 5; wy < base - 5; wy += 8) for (var wx = bx + 4; wx < bx + w - 4; wx += 7) P.rect(wx, wy, 3, 4, win);
      }
    });
  }
  // Rows of tall residential towers with balcony lines: off = scroll offset, period = spacing of each trio, w = tower width.
  function highrises(P, off, period, base, w, hMin, hVar, cols, win, bal) {
    P.tile(period, off, function (x, k) {
      for (var i = 0; i < 3; i++) {
        var h = hMin + P.hash(k * 3 + i) % hVar, bx = x + i * Math.floor(period / 3) + P.hash(k + i) % 8;
        P.rect(bx, base - h, w, h, cols[P.hash(k * 3 + i + 5) % cols.length]);
        for (var wy = base - h + 4; wy < base - 4; wy += 6) { P.rect(bx, wy + 4, w, 1, bal); for (var wx = bx + 3; wx < bx + w - 3; wx += 6) P.rect(wx, wy, 3, 3, win); }
      }
    });
  }
  function palm(P, x, baseY, h, trunk, frond) {
    for (var i = 0; i < h; i += 2) P.rect(x + Math.round(Math.sin(i / 18) * 2), baseY - i, 4, 3, trunk);
    var tx = x + 2 + Math.round(Math.sin(h / 18) * 2), ty = baseY - h;
    [[-22, 6], [-16, -5], [-7, -10], [7, -10], [16, -5], [22, 6], [-12, 12], [12, 12]].forEach(function (d) {
      line(P, tx, ty, tx + d[0], ty + d[1], frond, 2);
    });
    P.disc(tx, ty, 2, trunk);
  }
  // A tall queen palm with a pale trunk and big drooping fronds (the Torrey Pines palm).
  function queenPalm(P, x, baseY, h) {
    for (var i = 0; i < h; i += 2) P.rect(x + Math.round(Math.sin(i / 30) * 2), baseY - i, 6, 3, i > h - 14 ? '#c9b98e' : '#e6dcc2');
    var tx = x + 3 + Math.round(Math.sin(h / 30) * 2), ty = baseY - h;
    P.rect(tx - 4, ty - 2, 8, 6, '#b8a478');
    [[-40, -4], [-34, -16], [-20, -24], [-6, -28], [8, -28], [22, -24], [36, -16], [42, -4], [-30, 6], [32, 6]].forEach(function (d, i) {
      var mx = tx + d[0] * 0.6, my = ty + d[1] * 0.6 - 4;
      line(P, tx, ty, mx, my, i % 2 ? '#5f7a3a' : '#6f8a4a', 2);
      line(P, mx, my, tx + d[0], ty + d[1] + 18, i % 2 ? '#6f8a4a' : '#7f9a56', 2);
    });
  }
  function agave(P, x, baseY, size, c1, c2) {
    [-60, -35, -12, 12, 35, 60].forEach(function (deg, i) {
      var a = deg * Math.PI / 180;
      line(P, x, baseY, x + Math.round(Math.sin(a) * size), baseY - Math.round(Math.cos(a) * size), i % 2 ? c1 : c2, 3);
    });
  }
  function shrub(P, x, y, w, h, c1, c2) {
    P.disc(x + w / 2, y + h / 2, Math.floor(h / 2), c1); P.rect(x, y + h / 2, w, h / 2, c1);
    P.rect(x + 3, y + 3, w / 2, 3, c2);
  }
  function glassGrid(P, x, y, w, h, cols, rows, frame, glass, hi) {
    P.rect(x, y, w, h, frame);
    var cw = (w - 2) / cols, rh = (h - 2) / rows;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      P.rect(x + 1 + c * cw + 1, y + 1 + r * rh + 1, cw - 1, rh - 1, glass);
      if (hi) P.rect(x + 1 + c * cw + 1, y + 1 + r * rh + 1, cw - 1, 2, hi);
    }
  }

  var draw = {};

  // Bird Rock, La Jolla: the original 2006 shop on La Jolla Blvd (from the street photo). A red-orange band over a dark fascia,
  // sandstone block wall, two storefront windows with wooden bench ledges, a black glass door, and a sidewalk tree.
  draw.birdrock = function (P, s, sec) {
    sky(P, ['#7cc7e8', '#98d5ee', '#b6e4f3']); clouds(P, sec, s, '#f7fcff');
    houses(P, s * 0.12, 176, ['#efe3c8', '#f4d9b8', '#dcc7a4', '#f2ead6'], '#b86a4a', '#a9b8a0');
    P.tile(430, s * 0.5, function (x) {
      var bx = x + 20;
      P.rect(bx, 60, 340, 44, '#cf5a30'); P.rect(bx, 60, 340, 3, '#a8431f');                       // red-orange band
      P.rect(bx, 104, 340, 10, '#3b2a24'); P.rect(bx, 114, 340, 2, '#8a2a1a');                       // dark fascia
      brick(P, bx, 116, 340, 108, '#caa575', '#b08a5c');                                            // sandstone wall
      P.rect(bx + 14, 118, 118, 14, '#7a2214'); P.text('BIRD ROCK COFFEE', bx + 73, 129, 6, '#f1e2c8', 'center');   // left sign
      P.rect(bx + 14, 134, 118, 54, '#1b1614'); P.rect(bx + 14, 134, 118, 2, '#3a2f29');
      P.rect(bx + 20, 146, 40, 2, '#5a4636'); P.rect(bx + 20, 158, 40, 2, '#5a4636');                // shelves inside
      person(P, bx + 78, 170, '#8a9a6a'); person(P, bx + 38, 172, '#8f9ba8'); person(P, bx + 100, 171, '#6a7a8a');
      P.rect(bx + 8, 188, 130, 5, '#d29a60'); P.rect(bx + 24, 193, 3, 6, '#7a5230'); P.rect(bx + 112, 193, 3, 6, '#7a5230');   // bench ledge
      P.rect(bx + 148, 118, 46, 106, '#14110e'); P.rect(bx + 152, 122, 38, 98, '#4a3c30');         // black glass door
      for (var sh = 0; sh < 5; sh++) P.rect(bx + 154, 134 + sh * 16, 34, 3, '#b98a52');
      P.rect(bx + 180, 122, 3, 98, '#14110e');
      P.rect(bx + 216, 118, 120, 14, '#241d1a'); P.rect(bx + 244, 123, 64, 2, '#e8e0d0'); P.rect(bx + 256, 127, 40, 1, '#cfc7b8');   // right sign (a neighbor)
      P.rect(bx + 216, 134, 120, 54, '#1b1614');
      person(P, bx + 232, 170, '#c9c9d4'); person(P, bx + 256, 169, '#8f9ba8', '#4a5a8a'); person(P, bx + 282, 170, '#9aa8b8'); person(P, bx + 306, 171, '#2a2a30');
      P.rect(bx + 208, 188, 132, 5, '#d29a60'); P.rect(bx + 224, 193, 3, 6, '#7a5230'); P.rect(bx + 316, 193, 3, 6, '#7a5230');
      P.rect(bx - 12, 196, 18, 18, '#8a4a32'); P.disc(bx - 3, 192, 9, '#3f7a3a');                  // potted plant
    });
    P.tile(520, s * 0.85, function (x) {
      var tx = x + 40;
      P.rect(tx, 120, 5, 104, '#8a8178'); line(P, tx + 2, 130, tx - 18, 104, '#8a8178', 3); line(P, tx + 2, 126, tx + 24, 100, '#8a8178', 3);
      [[-26, 98], [-8, 90], [16, 92], [30, 102], [-14, 108], [8, 106]].forEach(function (d) { P.disc(tx + d[0], d[1], 9, '#5f9a45'); });
      P.rect(tx + 70, 206, 26, 14, '#c9743a'); P.rect(tx + 72, 208, 6, 4, '#2a8aa0'); P.rect(tx + 82, 212, 6, 4, '#e8c04a'); P.rect(tx + 72, 215, 5, 3, '#f2ead6');   // mosaic stool
    });
    ground(P, s, '#8d9096', '#2fa37a', '#a9acb2');
  };

  // Morena: the roastery (from the street photo). A boxy tan wood-plank overhang with a wooden roll-up window opening beneath it,
  // white painted block wall with the address and teal sunburst, a black fascia with big white letters, poster windows, agave.
  draw.morena = function (P, s, sec) {
    sky(P, ['#a8c4e0', '#bdd2e8', '#d2e0ee']); clouds(P, sec, s, '#f4f8fc');
    P.tile(300, s * 0.12, function (x, k) { P.disc(x + 60, 176, 26, '#4b7a52'); P.disc(x + 84, 182, 20, '#3d6b45'); P.rect(x + 30, 176, 80, 20, '#3d6b45'); });
    P.rect(0, 190, P.W, GY - 190, '#d9cdb6');
    P.tile(440, s * 0.5, function (x) {
      var bx = x + 20;
      P.rect(bx, 64, 176, 70, '#d9b88a');                                                                  // wood-plank overhang
      for (var r = 0; r < 70; r += 9) P.rect(bx, 64 + r, 176, 1, '#b8946a');
      for (var c = 0; c < 176; c += 38) P.rect(bx + ((c / 38) % 2 ? 12 : 0) + c, 64, 1, 70, '#b8946a');
      P.rect(bx, 64, 176, 3, '#efe6d6');
      P.rect(bx, 134, 176, 14, '#f1efe9'); P.rect(bx, 148, 176, 7, '#26282b');                           // white soffit, dark band
      P.rect(bx + 4, 156, 112, 66, '#c99358');                                                           // wooden frame of the roll-up window
      P.rect(bx + 10, 160, 100, 48, '#14100e');
      P.rect(bx + 54, 164, 36, 30, '#2a3a2e'); P.rect(bx + 60, 168, 12, 14, '#6f9a6a'); P.rect(bx + 76, 168, 10, 14, '#5f8a5a');   // trees seen through
      P.rect(bx + 14, 192, 90, 3, '#d9a85a'); P.rect(bx + 20, 195, 3, 17, '#d9a85a'); P.rect(bx + 94, 195, 3, 17, '#d9a85a');
      person(P, bx + 32, 176, '#f2f2ee'); person(P, bx + 70, 177, '#d9d2c4', '#4a3f35');
      P.rect(bx + 2, 208, 120, 7, '#e8bf7e'); P.rect(bx + 2, 215, 120, 2, '#b8864a');                  // wooden ledge
      P.rect(bx + 122, 156, 40, 66, '#1c2024'); P.rect(bx + 126, 160, 32, 58, '#5f8a80'); P.rect(bx + 150, 186, 2, 12, '#c8cdd0');   // glass door
      P.rect(bx + 176, 100, 90, 124, '#f4f4f0');                                                         // white painted block wall
      for (var b = 0; b < 124; b += 8) { P.rect(bx + 176, 100 + b, 90, 1, '#d8d8d2'); for (var q = (b / 8) % 2 * 10; q < 90; q += 20) P.rect(bx + 176 + q, 100 + b, 1, 8, '#d8d8d2'); }
      P.text('1270', bx + 221, 128, 8, '#1c1c20', 'center');
      line(P, bx + 221, 146, bx + 241, 166, '#1fb0c0', 2); line(P, bx + 241, 166, bx + 221, 186, '#1fb0c0', 2);   // teal sunburst diamond
      line(P, bx + 221, 186, bx + 201, 166, '#1fb0c0', 2); line(P, bx + 201, 166, bx + 221, 146, '#1fb0c0', 2);
      P.disc(bx + 221, 166, 6, '#1fb0c0'); P.rect(bx + 218, 160, 2, 12, '#f4f4f0');
      P.rect(bx + 262, 104, 150, 40, '#2a2b2e'); P.rect(bx + 262, 104, 150, 2, '#f2f2ee'); P.rect(bx + 262, 142, 150, 2, '#f2f2ee');   // black fascia
      P.text('BIRD ROCK COFFEE ROASTERS', bx + 337, 130, 6, '#f6f6f2', 'center');
      P.rect(bx + 266, 148, 146, 62, '#e8ecef');                                                         // poster windows
      for (var w = 0; w < 5; w++) P.rect(bx + 268 + w * 29, 150, 27, 58, ['#cfe6ee', '#c9a070', '#d8d8d4', '#c8d6dc', '#e0a050'][w]);
      P.rect(bx + 272, 172, 18, 12, '#2a7fa0'); P.rect(bx + 275, 168, 8, 6, '#2a7fa0'); P.disc(bx + 277, 186, 3, '#14202a'); P.disc(bx + 287, 186, 3, '#14202a');
      P.rect(bx + 262, 208, 150, 16, '#f4f4f0');
    });
    P.tile(300, s * 0.85, function (x, k) {
      agave(P, x + 40, GY, 20 + P.hash(k) % 6, '#7fa89a', '#5f8a7e'); agave(P, x + 70, GY, 14, '#6b9588', '#86b2a2');
      line(P, x + 150, GY, x + 152, GY - 90, '#8a9a5a', 2); P.rect(x + 148, GY - 94, 6, 6, '#c44a3a');       // tall spike with red tips
      agave(P, x + 190, GY, 18, '#86b2a2', '#6b9588'); agave(P, x + 222, GY, 12, '#7fa89a', '#5f8a7e');
    });
    ground(P, s, '#cfc6b4', '#a89d88', '#e0d7c6');
  };

  // Bressi Ranch: stucco clock-tower entrance with a dark green sign panel, arched door, stone base, orange flowers.
  draw.bressi = function (P, s, sec) {
    sky(P, ['#a9d8f0', '#c3e4f5', '#dff1f8']); clouds(P, sec, s, '#ffffff');
    houses(P, s * 0.12, 180, ['#e8dcc3', '#dccdb0', '#efe4cf'], '#8a6a55', '#a4b08a');
    P.tile(380, s * 0.5, function (x) {
      var bx = x + 30;
      P.rect(bx, 150, 230, 74, '#d9c9a8'); P.rect(bx, 150, 230, 4, '#c0ad88');                                  // low wing
      P.rect(bx + 160, 168, 60, 56, '#2f3a40'); P.rect(bx + 164, 172, 52, 6, '#1f282d');
      brick(P, bx, 196, 60, 28, '#a07556', '#85604a');
      P.rect(bx + 6, 162, 48, 30, '#222c32');                                                                   // dark awning
      var tx = bx + 80;
      P.rect(tx, 70, 76, 154, '#ece0c8'); P.rect(tx - 4, 112, 84, 4, '#8f7f66');
      P.rect(tx - 6, 64, 88, 8, '#767680'); P.rect(tx - 2, 58, 80, 6, '#6a6a74'); P.rect(tx + 8, 50, 60, 8, '#767680'); P.rect(tx + 20, 44, 36, 6, '#6a6a74');
      P.disc(tx + 38, 86, 7, '#2a2e33'); P.disc(tx + 38, 86, 5, '#3d444b');
      P.rect(tx + 6, 118, 64, 36, '#3b5a55');                                                                   // sign panel
      P.text('BIRD ROCK', tx + 38, 132, 8, '#f4f1e6', 'center'); P.text('COFFEE ROASTERS', tx + 38, 144, 4, '#f4f1e6', 'center');
      P.rect(tx + 22, 168, 32, 56, '#38302a'); P.rect(tx + 24, 164, 28, 4, '#38302a');                           // arched entry
      P.rect(tx + 18, 158, 40, 8, '#2f4f58');
      P.rect(tx + 62, 176, 8, 22, '#2aa7b0');                                                                    // teal umbrella
      brick(P, tx, 196, 76, 28, '#a07556', '#85604a');
      P.rect(tx + 26, 172, 24, 52, '#25201c');
    });
    P.tile(260, s * 0.85, function (x, k) {
      shrub(P, x + 10, GY - 22, 56, 22, '#4f8a43', '#6ea85a'); shrub(P, x + 50, GY - 18, 44, 18, '#3f7a3a', '#5f9c4e');
      for (var i = 0; i < 9; i++) P.rect(x + 14 + P.hash(k + i) % 80, GY - 20 + P.hash(k * 3 + i) % 14, 4, 4, i % 3 ? '#e8822c' : '#f2b13a');
    });
    ground(P, s, '#b6b0a4', '#8f897d', '#d0cabd');
  };

  // Encinitas: red brick arches under a terracotta roof, the teal pill sign, a potted succulent, palm fronds.
  draw.encinitas = function (P, s, sec) {
    sky(P, ['#8fcdf0', '#aadbf3', '#c8e8f6']); clouds(P, sec, s, '#fbfeff');
    houses(P, s * 0.12, 182, ['#f2e6cf', '#e9d4b4', '#dfe9e6'], '#9a5a44', '#9db08a');
    P.tile(380, s * 0.5, function (x) {
      var bx = x + 40;
      brick(P, bx, 132, 190, 92, '#a8452f', '#7d3426');
      P.rect(bx - 12, 104, 214, 8, '#c9b8a2');
      P.rect(bx - 10, 74, 210, 32, '#8a5a44');
      for (var r = 0; r < 32; r += 4) P.rect(bx - 10, 74 + r, 210, 1, '#6f4533');
      for (var cx = 0; cx < 210; cx += 10) P.rect(bx - 10 + cx, 74, 1, 32, '#6f4533');
      P.rect(bx - 12, 106, 214, 4, '#e0d6c4');
      [[10, 24], [150, 24]].forEach(function (a) {                                                                // arched windows
        P.rect(bx + a[0], 138, 28, 62, '#173a3f'); P.disc(bx + a[0] + 14, 140, 14, '#173a3f'); P.rect(bx + a[0] + 4, 150, 20, 46, '#3a7a80');
      });
      P.rect(bx + 66, 132, 58, 92, '#1e3b44'); P.disc(bx + 95, 140, 29, '#1e3b44');                               // glass door
      glassGrid(P, bx + 70, 142, 50, 80, 2, 4, '#1e3b44', '#6fb0b8', '#a4d8d6');
      P.rect(bx + 40, 114, 110, 18, '#1f9bb5'); P.rect(bx + 38, 116, 114, 14, '#1f9bb5');                         // teal pill sign
      P.text('BIRD ROCK COFFEE', bx + 95, 127, 6, '#ffffff', 'center');
      person(P, bx + 168, 194, '#b86a4a'); person(P, bx + 182, 196, '#7da7c9');
    });
    P.tile(340, s * 0.85, function (x) {
      P.rect(x + 24, GY - 22, 26, 22, '#d96a2b'); P.rect(x + 22, GY - 25, 30, 5, '#e98a4a');
      agave(P, x + 37, GY - 22, 24, '#5f9a4a', '#7fb85f');
    });
    P.tile(380, s * 0.9, function (x) { palm(P, x + 22, GY, 120, '#b9a27a', '#4f8a43'); });
    ground(P, s, '#cdb99a', '#a99578', '#e2d1b2');
  };

  // Torrey Pines Beach: sunset over the lagoon and ocean, and the cafe's big glass-railed patio, the star of the scene: people at tables
  // under a teal umbrella and a folded cream one, a dark wood band and sign above, colorful succulents, and a tall queen palm out front.
  draw.torrey = function (P, s, sec) {
    sky(P, ['#6f8fc0', '#b392b8', '#e8a39a', '#f6c08c', '#fbd9a0']); clouds(P, sec, s, '#f6c9c0');
    P.disc(230, 150, 20, '#fff0b8'); P.disc(230, 150, 14, '#fffbe0');
    P.rect(0, 150, P.W, 40, '#6a88b3');
    P.tile(70, s * 0.12 + sec * 6, function (x, k) { P.rect(x + 10, 154 + (P.hash(k) % 28), 22, 2, '#ffe2b0'); });
    P.rect(0, 190, P.W, GY - 190, '#d9bf98');
    P.rect(0, 150, P.W, 3, '#e8b88e');
    function diner(x, y, shirt, hair) {                         // a seated person, bigger than the street scenes use: 10 wide
      P.rect(x + 2, y, 6, 6, '#e8b894'); P.rect(x + 2, y, 6, 2, hair); P.rect(x, y + 6, 10, 12, shirt); P.rect(x + 1, y + 18, 8, 6, '#34424f');
    }
    P.tile(460, s * 0.5, function (x) {
      var bx = x + 24;
      P.rect(bx, 74, 280, 150, '#f3f0ea');                                                               // white stucco
      P.rect(bx - 6, 66, 292, 22, '#6b4430');                                                            // dark wood band
      for (var k = 0; k < 22; k += 4) P.rect(bx - 6, 66 + k, 292, 1, '#4f3123');
      P.text('2212', bx + 22, 108, 7, '#2a2a2e', 'center');
      P.text('BIRD ROCK', bx + 140, 112, 12, '#26262a', 'center');
      P.rect(bx + 62, 118, 156, 14, '#6b4430'); P.text('COFFEE ROASTERS', bx + 140, 129, 7, '#f3f0ea', 'center');
      P.rect(bx + 8, 136, 264, 80, '#1d2a33'); P.rect(bx + 8, 136, 264, 2, '#c8cdd0');                   // glass front
      for (var m = 0; m < 6; m++) P.rect(bx + 8 + m * 53, 136, 2, 80, '#3b4a54');
      var tx = bx + 84;                                                                                  // teal umbrella
      P.rect(tx - 1, 150, 3, 56, '#7a6a55');
      for (var u = 0; u < 12; u++) P.rect(tx - 9 - u * 3, 146 + u, 19 + u * 6, 1, u > 9 ? '#14899e' : '#1fb3c8');
      P.rect(bx + 208, 146, 9, 60, '#d8c9a8'); P.rect(bx + 209, 140, 7, 7, '#b8a888');                  // folded cream umbrella
      [[16, '#e8a0a0', '#4a3426'], [40, '#c8c8d0', '#d8d8d8'], [120, '#d86a7a', '#2a1a14'], [146, '#7ab0c8', '#5a3a26'], [176, '#c8c8d0', '#2a2a2a'], [236, '#c47ad0', '#3a2a1a'], [258, '#e8c070', '#5a3a26']].forEach(function (pp) {
        diner(bx + pp[0], 164, pp[1], pp[2]);
      });
      [[8, 40], [112, 60], [200, 48]].forEach(function (t) { P.rect(bx + t[0], 184, t[1], 3, '#b07a3a'); P.rect(bx + t[0] + 4, 187, 3, 8, '#7a5230'); });   // tables
      P.rect(bx + 4, 188, 272, 30, 'rgba(190,215,225,0.30)'); P.rect(bx + 2, 186, 276, 3, '#d8dde0');   // glass railing
      for (var q = 0; q <= 264; q += 44) P.rect(bx + 6 + q, 186, 2, 32, '#d8dde0');
      P.rect(bx, 212, 280, 12, '#f0ede6'); P.rect(bx, 212, 280, 1, '#cfcac0');                          // patio wall
      [[14, '#b8b23a'], [66, '#d49a2a'], [124, '#b8b23a'], [186, '#d4cc4a'], [246, '#b8b23a']].forEach(function (b) { shrub(P, bx + b[0], 202, 40, 14, b[1], '#e8d86a'); });
      agave(P, bx - 8, GY, 28, '#b8642a', '#d9a02c'); agave(P, bx + 14, GY, 20, '#d9a02c', '#a85a3a');
      queenPalm(P, bx + 142, GY, 176);                                                                   // palm in front of the sign
    });
    ground(P, s, '#cdb594', '#b09872', '#e2cdac');
  };

  // Little Italy: red brick corner building with big white letters, black steel windows, a wood hanging sign, teal stools,
  // the cream stucco building with a concrete balcony next door, and a jacaranda in bloom.
  draw.littleitaly = function (P, s, sec) {
    sky(P, ['#8fcdf0', '#aadbf3', '#c8e8f6']); clouds(P, sec, s, '#fbfeff');
    towers(P, s * 0.12, 190, ['#b8c4cc', '#a9b6c0', '#c8cfd4'], '#6f8aa0', '#9aa8b2');
    P.tile(400, s * 0.5, function (x) {
      var bx = x + 30;
      P.rect(bx + 168, 80, 90, 144, '#e6dcc6'); P.rect(bx + 160, 130, 98, 8, '#9a9a96');                           // stucco neighbor, balcony slab
      for (var i = 0; i < 9; i++) P.rect(bx + 164 + i * 11, 118, 2, 12, '#3a4046'); P.rect(bx + 164, 116, 98, 2, '#3a4046');
      P.rect(bx + 178, 150, 54, 40, '#34383d'); P.rect(bx + 178, 150, 54, 3, '#8a8a88');                            // open roll-up door
      brick(P, bx, 56, 172, 168, '#a34a36', '#7d3426');
      P.rect(bx + 98, 62, 54, 46, '#1a2128'); glassGrid(P, bx + 100, 64, 50, 42, 2, 2, '#1a2128', '#6f9db8', '#a4c6d8');
      P.rect(bx + 14, 64, 30, 56, '#1a2128'); P.rect(bx + 16, 66, 26, 52, '#3f5a6a');
      P.text('BIRD ROCK', bx + 88, 138, 10, '#fbfaf5', 'center'); P.text('COFFEE ROASTERS', bx + 88, 150, 6, '#fbfaf5', 'center');
      P.rect(bx + 72, 156, 84, 68, '#1a2128'); glassGrid(P, bx + 74, 158, 80, 66, 2, 3, '#1a2128', '#43697e', '#6f9db8');
      P.rect(bx + 90, 178, 20, 16, '#e8e8e2'); P.disc(bx + 100, 184, 4, '#1a2128');                               // van decal
      P.rect(bx + 6, 164, 54, 38, '#1a2128'); P.rect(bx + 8, 166, 50, 34, '#35505c');                             // roll-up window
      P.rect(bx - 22, 150, 26, 18, '#7a5a3a'); P.rect(bx - 20, 152, 22, 14, '#8a6a4a'); P.rect(bx - 15, 156, 12, 8, '#1f9bb5');   // hanging sign
      brick(P, bx - 20, 198, 190, 26, '#a34a36', '#7d3426');
      for (var t = 0; t < 4; t++) { P.rect(bx + 78 + t * 14, 196, 8, 3, '#1fa7a0'); P.rect(bx + 79 + t * 14, 199, 2, 25, '#1fa7a0'); P.rect(bx + 84 + t * 14, 199, 2, 25, '#1fa7a0'); }
      P.rect(bx + 74, 192, 60, 3, '#c9a273');
    });
    P.tile(520, s * 0.85, function (x) {
      P.rect(x + 40, 120, 5, 104, '#6f5a48');
      [[-14, 100], [0, 90], [18, 96], [30, 108], [-6, 110], [12, 112]].forEach(function (d, i) { P.disc(x + 42 + d[0], d[1], 10, i % 2 ? '#9a78c8' : '#b494de'); });
    });
    ground(P, s, '#b9b3a8', '#9a948a', '#d3cec4');
  };

  // Waterfront: downtown San Diego. High-rise towers all around, and a corner storefront with a cedar ceiling, black steel frame,
  // an open glass roll-up window with a laptop counter, a white V-shaped blade sign with the teal van, and big letters in the glass.
  draw.waterfront = function (P, s, sec) {
    sky(P, ['#9bbdd4', '#b4cfdf', '#cfe0ea']); clouds(P, sec, s, '#eef5f9');
    highrises(P, s * 0.1, 150, 210, 38, 110, 80, ['#b8c4cc', '#a9b7c1'], '#6f8aa0', '#98a8b4');
    highrises(P, s * 0.24, 210, 224, 54, 140, 70, ['#8fa0ad', '#7f94a3'], '#5f7a90', '#788a98');
    P.tile(430, s * 0.5, function (x) {
      var bx = x + 30;
      P.rect(bx, 0, 250, 92, '#3d444c');                                                                 // metal-clad floors above
      for (var v = 0; v < 250; v += 42) P.rect(bx + v, 0, 1, 92, '#5a626b');
      P.rect(bx, 46, 250, 2, '#5a626b');
      P.rect(bx, 92, 250, 36, '#8f4f27');                                                                // cedar ceiling
      for (var p = 0; p < 36; p += 5) P.rect(bx, 92 + p, 250, 1, '#6f3a1c');
      for (var l = 0; l < 3; l++) P.rect(bx + 30 + l * 84, 112, 8, 4, '#ffe9b0');
      P.rect(bx, 128, 250, 96, '#14171a');                                                               // black steel frame
      P.rect(bx, 128, 12, 82, '#b8702e');                                                                // cedar cladding
      P.rect(bx + 12, 134, 88, 74, '#0d0f11');                                                           // roll-up window opening
      glassGrid(P, bx + 16, 152, 80, 54, 3, 2, '#1a1f24', '#33506a', '#5a7e98');
      P.rect(bx + 12, 134, 88, 5, '#2a2f33'); P.rect(bx + 16, 139, 80, 11, '#4a6070'); P.rect(bx + 16, 139, 80, 2, '#9ab6c8');   // glass door tilted up
      P.rect(bx + 12, 198, 88, 6, '#efe7d2');
      person(P, bx + 34, 178, '#7a2f3a', '#2a2a30'); person(P, bx + 66, 180, '#ececf0', '#2a2a30'); P.rect(bx + 50, 191, 12, 6, '#e8e8ee');
      P.rect(bx + 100, 128, 10, 96, '#0d0f11');
      glassGrid(P, bx + 112, 132, 134, 76, 3, 3, '#0d0f11', '#6f8ea6', '#9ab6c8');                       // right storefront glass
      P.text('BIRD ROCK', bx + 178, 176, 10, '#14202a', 'center'); P.text('COFFEE ROASTERS', bx + 178, 190, 6, '#14202a', 'center');
      P.rect(bx + 76, 100, 24, 40, '#f2f6f6'); P.rect(bx + 104, 100, 24, 40, '#f2f6f6'); P.rect(bx + 98, 98, 8, 44, '#d4dadc');   // V-shaped blade sign
      P.rect(bx + 80, 114, 16, 10, '#1fb0c8'); P.rect(bx + 82, 110, 10, 5, '#1fb0c8'); P.disc(bx + 85, 126, 3, '#1fb0c8'); P.disc(bx + 93, 126, 3, '#1fb0c8');
      P.text('BIRD', bx + 116, 112, 5, '#1fb0c8', 'center'); P.text('ROCK', bx + 116, 124, 5, '#1fb0c8', 'center'); P.text('COFFEE', bx + 116, 136, 4, '#1fb0c8', 'center');
      P.rect(bx, 210, 250, 14, '#2c3238');
      for (var i = 0; i < 12; i++) P.rect(bx + 8 + i * 20, 207, 7, 4, i % 2 ? '#8fb078' : '#b0a8c8');     // succulents in the planter
    });
    P.tile(300, s * 0.85, function (x) {                                                                  // street light
      P.rect(x + 40, 110, 3, 114, '#3a4048'); P.rect(x + 30, 108, 22, 3, '#3a4048'); P.rect(x + 28, 111, 6, 4, '#f2e8b0');
    });
    ground(P, s, '#8f9398', '#bfc3c6', '#aaaeb3');
  };

  // Liberty Station: terracotta barrel-tile roofs over peach stucco, big white letters, stucco columns, dark windows, red bougainvillea,
  // and the teal Bird Rock VW truck parked out front (from Roger's photo).
  draw.liberty = function (P, s, sec) {
    sky(P, ['#6fb4e8', '#8cc6ee', '#b0daf2']); clouds(P, sec, s, '#f4faff');
    P.rect(0, 160, P.W, GY - 160, '#c9bba0');
    P.tile(160, s * 0.12, function (x, k) { var h = 20 + P.hash(k) % 18; P.rect(x + 14, 160 - h, 60, h, '#e8d6b8'); P.rect(x + 12, 160 - h - 3, 64, 4, '#a4573c'); P.rect(x + 18, 160 - h + 6, 6, 8, '#4a6a5a'); P.rect(x + 62, 160 - h + 6, 6, 8, '#4a6a5a'); });
    P.tile(420, s * 0.5, function (x) {
      var bx = x + 30;
      P.rect(bx + 10, 38, 240, 36, '#c4592e');                                                         // upper tile roof
      for (var r = 0; r < 36; r += 4) P.rect(bx + 10, 38 + r, 240, 1, '#9c431f');
      for (var c = 0; c < 240; c += 6) P.rect(bx + 10 + c, 38, 1, 36, '#d9703c');
      P.rect(bx + 6, 34, 248, 5, '#d9703c'); P.rect(bx + 6, 74, 248, 3, '#8a4a30');
      P.rect(bx + 14, 77, 232, 38, '#e8a98a');                                                         // stucco band with the name
      P.text('BIRD ROCK COFFEE ROASTERS', bx + 132, 102, 8, '#7a4a32', 'center'); P.text('BIRD ROCK COFFEE ROASTERS', bx + 130, 100, 8, '#ffffff', 'center');
      P.rect(bx, 115, 260, 28, '#c4592e');                                                             // lower tile roof
      for (var r2 = 0; r2 < 28; r2 += 4) P.rect(bx, 115 + r2, 260, 1, '#9c431f');
      for (var c2 = 0; c2 < 260; c2 += 6) P.rect(bx + c2, 115, 1, 28, '#d9703c');
      P.rect(bx - 2, 143, 264, 5, '#8a4a30');
      P.rect(bx + 14, 148, 232, 76, '#e8a98a');
      [bx + 42, bx + 198].forEach(function (cx) {                                                      // stucco columns
        P.rect(cx - 9, 148, 18, 6, '#c98d6f'); P.rect(cx - 7, 154, 14, 70, '#dd9c7c'); P.rect(cx + 3, 154, 4, 70, '#c98d6f'); P.rect(cx - 9, 218, 18, 6, '#c98d6f');
      });
      glassGrid(P, bx + 64, 158, 48, 56, 2, 3, '#2a2420', '#1e1a18', '#4a3a30');                       // dark windows and door
      P.rect(bx + 118, 156, 40, 68, '#2a2420'); P.rect(bx + 122, 160, 32, 60, '#6a4a32'); P.rect(bx + 135, 160, 2, 60, '#2a2420');
      P.rect(bx + 162, 178, 24, 12, '#2a7fa0'); P.text('BIRD ROCK', bx + 174, 187, 3, '#ffffff', 'center');   // small blue sign
      glassGrid(P, bx + 202, 158, 34, 56, 2, 3, '#2a2420', '#1e1a18', '#4a3a30');
      shrub(P, bx + 12, 196, 34, 22, '#3f6a3a', '#5f8a4a');                                            // red bougainvillea
      for (var f = 0; f < 10; f++) P.rect(bx + 14 + P.hash(f) % 30, 198 + P.hash(f * 3) % 16, 3, 3, '#d8283a');
      var tx = bx + 56;                                                                                // the teal truck
      P.rect(tx, 192, 108, 22, '#18a9b0'); P.rect(tx, 192, 108, 3, '#4fd0d0');
      P.rect(tx + 2, 178, 44, 16, '#18a9b0'); P.rect(tx, 175, 48, 4, '#f3f3ef'); P.rect(tx + 8, 180, 12, 10, '#cfe6ea'); P.rect(tx + 24, 180, 16, 10, '#cfe6ea');
      P.rect(tx + 54, 186, 52, 8, '#18a9b0'); P.rect(tx + 54, 185, 52, 1, '#4fd0d0');
      P.text('CALIFORNIA', tx + 80, 192, 5, '#ffffff', 'center'); P.text('BIRD ROCK', tx + 24, 203, 4, '#ffffff', 'center');
      P.rect(tx - 4, 210, 8, 4, '#f3f3ef'); P.rect(tx + 104, 210, 8, 4, '#f3f3ef');
      P.disc(tx + 22, 214, 9, '#14161a'); P.disc(tx + 22, 214, 6, '#d8dde0'); P.disc(tx + 86, 214, 9, '#14161a'); P.disc(tx + 86, 214, 6, '#d8dde0');
    });
    ground(P, s, '#c9c2b4', '#a4573c', '#ddd6c8');
  };

  // The Village: the ground floor of the UCSD Innovation Center (from Roger's photo). Speckled gray metal panels, an oak soffit, white
  // letters with the van logo, a glass storefront and door, a board-formed concrete wall, and the cobalt-blue tiled pizza oven.
  draw.village = function (P, s, sec) {
    sky(P, ['#7fb8e6', '#9ccaee', '#bcdcf3']); clouds(P, sec, s, '#f8fcff');
    P.rect(0, 150, P.W, GY - 150, '#8aa08a');
    P.tile(160, s * 0.12, function (x, k) { var h = 20 + P.hash(k) % 30; P.rect(x + 20, 150 - h, 70, h, '#b6bcc2'); for (var w = 150 - h + 5; w < 146; w += 8) for (var wx = 26; wx < 84; wx += 9) P.rect(x + wx, w, 5, 4, '#6f94b0'); });
    P.tile(440, s * 0.5, function (x) {
      var bx = x + 60;
      P.rect(bx - 10, 0, 270, 62, '#b9b5ad');                                                            // concrete tower above
      for (var o = 0; o < 7; o++) P.rect(bx + 4 + o * 36, 8, 14, 46, o % 2 ? '#4a8fb5' : '#c98d50');
      P.rect(bx - 10, 60, 270, 4, '#9c9890');
      P.rect(bx, 64, 250, 72, '#8b8f96');                                                                // speckled metal panels
      for (var i = 0; i < 560; i++) P.rect(bx + P.hash(i) % 250, 64 + P.hash(i * 7 + 1) % 72, 2, 2, i % 3 ? '#6f747c' : '#aeb2b8');
      for (var v = 0; v < 250; v += 36) P.rect(bx + v, 64, 1, 72, '#5f646c');
      P.rect(bx - 8, 136, 266, 9, '#d9a463'); P.rect(bx - 8, 143, 266, 3, '#b8854a');                    // oak soffit
      P.rect(bx + 34, 98, 18, 12, '#fbfaf5'); P.rect(bx + 32, 96, 4, 14, '#fbfaf5'); P.disc(bx + 38, 112, 3, '#fbfaf5'); P.disc(bx + 48, 112, 3, '#fbfaf5');   // van logo
      P.text('BIRD ROCK COFFEE', bx + 132, 110, 8, '#fbfaf5', 'center');
      P.rect(bx, 146, 250, 78, '#16202a');                                                               // glass storefront
      glassGrid(P, bx + 6, 150, 238, 56, 8, 2, '#202c36', '#2c4150', '#5a7b8f');
      P.rect(bx + 54, 150, 34, 74, '#10161c'); P.rect(bx + 58, 154, 26, 66, '#2a3844'); P.rect(bx + 82, 184, 2, 12, '#c8cdd0');   // door
      var ox = bx + 192;                                                                                 // the cobalt-blue tiled pizza oven
      P.rect(ox - 4, 150, 8, 18, '#aab4bc'); P.rect(ox - 7, 147, 14, 4, '#8a949c');
      P.disc(ox, 190, 25, '#2d3fb5'); P.rect(ox - 25, 190, 51, 22, '#2d3fb5');
      for (var ty = 168; ty < 212; ty += 4) { var hw = ty < 190 ? Math.floor(Math.sqrt(625 - (ty - 190) * (ty - 190))) : 25; P.rect(ox - hw, ty, hw * 2 + 1, 1, '#4a5fd0'); }
      for (var tx = -24; tx <= 24; tx += 4) { var top = 190 - Math.floor(Math.sqrt(625 - tx * tx)); P.rect(ox + tx, top, 1, 212 - top, '#4a5fd0'); }
      P.rect(ox - 14, 172, 8, 3, '#8a9aee'); P.rect(ox - 8, 168, 4, 2, '#8a9aee');
      P.rect(bx + 120, 204, 138, 20, '#a9a69c');                                                         // board-formed concrete wall in front
      for (var b = 0; b < 20; b += 5) P.rect(bx + 120, 204 + b, 138, 1, '#8f8c84');
      P.rect(bx + 120, 202, 138, 3, '#c4c1b8');
      P.rect(bx - 58, 196, 70, 28, '#a9a69c'); for (var b2 = 0; b2 < 28; b2 += 5) P.rect(bx - 58, 196 + b2, 70, 1, '#8f8c84');
      P.rect(bx - 24, 170, 3, 28, '#6a5a48'); P.rect(bx - 56, 164, 64, 6, '#8b8478'); P.rect(bx - 46, 158, 44, 6, '#9a9488');   // patio umbrella
    });
    P.tile(260, s * 0.85, function (x, k) {
      for (var i = 0; i < 16; i++) { var gx = x + 8 + i * 15 + P.hash(k + i) % 6; line(P, gx, GY, gx + 3 - P.hash(i + k) % 7, GY - 9 - P.hash(i + 9) % 9, i % 3 ? '#a9b08a' : '#8a9a68', 2); }
      shrub(P, x + 120, GY - 14, 46, 14, '#6f8a5a', '#8fa876');
    });
    ground(P, s, '#bfbcb2', '#9a978d', '#d6d3c9');
  };

  // Park & Market: a glass office tower with concrete floor bands; the cafe's frosted storefront has the teal truck mural and
  // "PARK & MARKET" lettering; traffic lights, a bare tree and downtown towers.
  draw.parkmarket = function (P, s, sec) {
    sky(P, ['#6fb0e8', '#90c4ee', '#b2d8f3']); clouds(P, sec, s, '#f8fcff');
    towers(P, s * 0.12, 190, ['#8fa6b8', '#a4b6c4', '#7f98ac'], '#d6e4ee', '#7f98ac');
    P.tile(420, s * 0.5, function (x) {
      var bx = x + 20;
      for (var f = 0; f < 3; f++) {
        var fy = 6 + f * 48;
        P.rect(bx, fy + 38, 250, 10, '#cfc9bf'); P.rect(bx, fy + 46, 250, 2, '#a8a298');
        glassGrid(P, bx + 4, fy, 242, 38, 8, 1, '#8fa8b8', '#a9c6d8', '#dcecf4');
        P.rect(bx + 20 + f * 40, fy + 6, 44, 10, 'rgba(255,255,255,0.35)');
      }
      P.rect(bx, 150, 250, 74, '#dfe8ee');
      for (var c = 0; c < 250; c += 36) P.rect(bx + c, 150, 2, 74, '#8fa8b8');
      P.rect(bx + 12, 164, 96, 56, '#f3f6f6');
      P.rect(bx + 20, 192, 44, 14, '#2a9bb0'); P.rect(bx + 26, 186, 20, 8, '#2a9bb0'); P.disc(bx + 30, 208, 5, '#1c1c20'); P.disc(bx + 54, 208, 5, '#1c1c20');   // teal truck mural
      P.text('BIRD ROCK', bx + 82, 178, 8, '#1c1c20', 'center'); P.text('COFFEE ROASTERS', bx + 66, 188, 4, '#1c1c20', 'center');
      P.rect(bx + 124, 156, 8, 60, '#e060a8');
      P.text('PARK & MARKET', bx + 190, 172, 8, '#ffffff', 'center');
      P.rect(bx + 160, 180, 50, 34, '#27323a');
    });
    P.tile(440, s * 0.85, function (x) {
      P.rect(x + 40, 70, 4, 154, '#4a5f78'); P.rect(x + 34, 70, 16, 6, '#4a5f78'); P.rect(x + 28, 84, 8, 18, '#1c1c20'); P.disc(x + 32, 90, 2, '#e0503f'); P.disc(x + 32, 96, 2, '#3a8a4a');
      P.rect(x + 250, 150, 4, 74, '#6a5f56'); line(P, x + 252, 170, x + 232, 140, '#6a5f56', 2); line(P, x + 252, 166, x + 274, 138, '#6a5f56', 2); line(P, x + 252, 158, x + 252, 126, '#6a5f56', 2);
    });
    ground(P, s, '#8f939a', '#d9d3c8', '#b4b8be');
  };

  // UCSD: a lush, upscale campus. Green hills, rows of leafy trees, striped lawn and hedges, with the open-air kiosk (curved cantilever roof,
  // silver top, warm wood underside), the glass research building and the ribbed shell behind, and palms and flowering grasses in front.
  draw.ucsd = function (P, s, sec) {
    sky(P, ['#5f9ae0', '#80b4ea', '#a4cdf0', '#c2e0f4']); clouds(P, sec, s, '#f2f8ff');
    P.disc(60, 150, 70, '#79b072'); P.disc(210, 156, 80, '#6aa864'); P.disc(310, 150, 60, '#79b072'); P.rect(0, 150, P.W, 24, '#6aa864');   // green hills
    P.tile(300, s * 0.12, function (x) {
      glassGrid(P, x + 10, 84, 96, 66, 10, 4, '#e8eef2', '#3f80b8', '#7fb0d8');
      P.rect(x + 190, 110, 8, 40, '#e8eef2');
      for (var i = 0; i < 8; i++) { var h = 40 - Math.abs(i - 3.5) * 5; P.rect(x + 160 + i * 10, 150 - h, 5, h, '#f2f4f6'); }
    });
    P.tile(90, s * 0.3, function (x, k) {                                                                 // tree line
      P.rect(x + 40, 156, 5, 24, '#5a4630');
      P.disc(x + 28 + P.hash(k) % 14, 150, 24 + P.hash(k + 1) % 6, '#2d6e38');
      P.disc(x + 58 + P.hash(k + 2) % 14, 152, 20 + P.hash(k + 3) % 6, '#347a3e');
      P.disc(x + 40, 144, 14, '#4a9a4a');
    });
    P.rect(0, 174, P.W, GY - 174, '#58a64a');                                                            // lawn
    P.tile(40, s * 0.5, function (x) { P.rect(x, 174, 20, GY - 174, '#63b153'); });
    P.tile(26, s * 0.4, function (x) { P.disc(x + 11, 172, 7, '#2c7a3a'); P.rect(x, 172, 22, 8, '#2c7a3a'); });   // clipped hedge
    P.tile(440, s * 0.5, function (x) {
      var bx = x + 40;
      P.rect(bx - 20, 214, 250, 10, '#d6cdbd');                                                          // stone plaza
      P.rect(bx, 138, 170, 12, '#c9cfd4'); P.rect(bx + 10, 130, 150, 10, '#d9dee2'); P.rect(bx + 30, 126, 100, 6, '#e8ecef');   // curved roof
      P.rect(bx + 4, 148, 162, 8, '#c98a5a');
      P.rect(bx + 60, 156, 6, 68, '#e8ecef'); P.rect(bx + 150, 156, 6, 68, '#9aa3ac');
      P.rect(bx + 20, 164, 120, 60, '#2a2f35'); P.rect(bx + 20, 164, 120, 3, '#e8ecef');
      P.rect(bx + 20, 196, 120, 28, '#f2f4f6'); P.rect(bx + 20, 196, 120, 3, '#cfd5da');
      P.text('BIRD ROCK', bx + 80, 160, 6, '#fbfaf5', 'center');
      person(P, bx + 40, 178, '#e0b04a'); person(P, bx + 100, 178, '#4a86b5');
      P.rect(bx + 170, 192, 50, 4, '#f2f4f6'); for (var i = 0; i < 6; i++) P.rect(bx + 172 + i * 8, 196, 2, 28, '#f2f4f6');
    });
    P.tile(360, s * 0.85, function (x, k) {
      palm(P, x + 300, GY, 112, '#a89a78', '#3f8a3a');
      for (var i = 0; i < 14; i++) {
        var gx = x + 8 + i * 22 + P.hash(k + i) % 8;
        line(P, gx, GY, gx + 5 - P.hash(i + k) % 10, GY - 12 - P.hash(i + 9) % 12, i % 2 ? '#7fb85a' : '#4f9a45', 2);
        if (i % 3 === 0) P.rect(gx, GY - 18 - P.hash(i) % 8, 3, 3, i % 2 ? '#f6f2e0' : '#f2c744');
      }
    });
    ground(P, s, '#d2cabb', '#a89d8c', '#e4dccd');
  };

  return { draw: draw, ids: Object.keys(draw) };
});

/*
 * The wallpaper behind the home screen: soft color fields, as on macOS, that follow the sun through the day.
 * Night, dawn, morning, afternoon, sunset and dusk blend into each other by the minute, timed to the city's own
 * sunrise and sunset (Data.sun). It's drawn small on a canvas and stretched, which is already as soft as a blur, and
 * redrawn once a minute with a crossfade: nothing moves under the glass between redraws, so the TV's GPU stays idle.
 */
(function () {
  // Each look: the base color and four light fields [x, y, radius, color], on a 0..1 stage.
  var LOOKS = {
    night:     ['#070B1E', [[0.15, 0.20, 0.70, '#1C2A6B'], [0.85, 0.15, 0.60, '#3A1E6E'], [0.70, 0.90, 0.70, '#0E3D66'], [0.20, 0.95, 0.55, '#160B33']]],
    dawn:      ['#2C2F6E', [[0.10, 0.90, 0.75, '#FF8A7A'], [0.55, 1.00, 0.65, '#FFC796'], [0.85, 0.25, 0.70, '#7D6CC4'], [0.25, 0.15, 0.55, '#4B4FA8']]],
    morning:   ['#BFE3FF', [[0.15, 0.15, 0.70, '#8CC8FF'], [0.85, 0.20, 0.65, '#E4F3FF'], [0.70, 0.95, 0.70, '#FFE9C2'], [0.10, 0.90, 0.60, '#B5D4FF']]],
    afternoon: ['#9CD0FF', [[0.10, 0.20, 0.75, '#5FB0FF'], [0.90, 0.10, 0.60, '#B8F0FF'], [0.75, 0.90, 0.70, '#8FE3C8'], [0.20, 0.95, 0.60, '#7AA8F5']]],
    sunset:    ['#3B1D6E', [[0.15, 0.90, 0.75, '#FF5E3A'], [0.60, 1.00, 0.70, '#FFA33A'], [0.85, 0.30, 0.65, '#D6246E'], [0.25, 0.15, 0.60, '#5B2A8C']]],
    dusk:      ['#141235', [[0.20, 0.85, 0.70, '#8C2E6B'], [0.80, 0.95, 0.60, '#C2553F'], [0.75, 0.20, 0.65, '#2B2A7A'], [0.15, 0.15, 0.55, '#1A1648']]]
  };

  /** The day as keyframes [minute, look], around the sunrise and the sunset. */
  function keyframes(sun) {
    var r = sun.rise, s = sun.set;
    return [
      [r - 60, 'night'], [r, 'dawn'], [r + 90, 'morning'], [(r + s) / 2 + 60, 'afternoon'],
      [s - 30, 'sunset'], [s + 40, 'dusk'], [s + 110, 'night']
    ];
  }

  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mixColor(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ','
      + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  function ease(t) { return t * t * (3 - 2 * t); }

  /** The blend of two looks at this minute: [look A, look B, t]. */
  function lookAt(mins, sun) {
    var theme = Prefs.theme();
    if (theme === 'dark') return ['night', 'night', 0];
    if (theme === 'light') return ['afternoon', 'afternoon', 0];
    var k = keyframes(sun), day = 1440, i;
    for (i = 0; i < k.length; i++) {
      var from = k[i], to = k[(i + 1) % k.length];
      var start = from[0], end = to[0] + (i + 1 === k.length ? day : 0), m = mins;
      if (m < start) m += day;
      if (m >= start && m < end) return [from[1], to[1], ease((m - start) / (end - start))];
    }
    return ['night', 'night', 0];
  }

  function draw(canvas, look, mins) {
    var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    var a = LOOKS[look[0]], b = LOOKS[look[1]], t = look[2];
    ctx.globalAlpha = 1;
    ctx.fillStyle = mixColor(a[0], b[0], t);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < 4; i++) {
      var p = a[1][i], q = b[1][i];
      // A slow drift through the day, so the fields are never quite where they were.
      var drift = Math.sin(mins / 97 + i * 1.7) * 0.06;
      var x = (p[0] + (q[0] - p[0]) * t + drift) * w, y = (p[1] + (q[1] - p[1]) * t - drift) * h;
      var radius = (p[2] + (q[2] - p[2]) * t) * w;
      var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      var c = mixColor(p[3], q[3], t);
      g.addColorStop(0, c);
      g.addColorStop(1, c.replace('rgb', 'rgba').replace(')', ',0)'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Photos, when web/ has them: wp-night.jpg under wp-day.jpg, the day one fading in around sunrise and out around
  // sunset. Without them, the color fields above.
  var photos = false;

  function dayOpacity(mins, sun) {
    var theme = Prefs.theme();
    if (theme === 'dark') return 0;
    if (theme === 'light') return 1;
    function ramp(from, to) { return Math.max(0, Math.min(1, (mins - from) / (to - from))); }
    return ease(Math.min(ramp(sun.rise - 30, sun.rise + 60), 1 - ramp(sun.set - 45, sun.set + 30)));
  }

  function usePhotos() {
    var sky = document.getElementById('sky'), veil = sky.querySelector('.veil');
    var night = document.createElement('div'), day = document.createElement('div');
    night.className = 'photo';
    night.style.backgroundImage = 'url(wp-night.jpg)';
    day.className = 'photo day-photo';
    day.style.backgroundImage = 'url(wp-day.jpg)';
    sky.insertBefore(night, veil);
    sky.insertBefore(day, veil);
    photos = true;
    document.getElementById('wpA').style.display = 'none';
    document.getElementById('wpB').style.display = 'none';
    paint();
  }

  var front = 'wpA';

  /** Paints now, or at a given minute of the day (for the preview). */
  function paint(at) {
    var d = new Date(), mins = typeof at === 'number' ? at : d.getHours() * 60 + d.getMinutes();
    if (photos) {
      document.querySelector('#sky .day-photo').style.opacity = dayOpacity(mins, Data.sun());
      return;
    }
    var next = front === 'wpA' ? 'wpB' : 'wpA', canvas = document.getElementById(next);
    if (!canvas) return;
    draw(canvas, lookAt(mins, Data.sun()), mins);
    canvas.className = 'wp on';
    document.getElementById(front).className = 'wp';
    front = next;
  }

  /** True when the photos are up: they're dark at every hour, so the home screen keeps its night text. */
  window.Wallpaper = {refresh: paint, dark: function () { return photos; }};
  paint();
  var probe = new Image();
  probe.onload = usePhotos;
  probe.src = 'wp-day.jpg';
  setInterval(paint, 60000);
})();

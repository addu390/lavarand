#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uCam;
uniform vec2 uGrid;
uniform int uLampCount;
uniform float uDetail;
uniform float uGlow;
uniform float uLight;
uniform sampler2D uBlobA;
uniform sampler2D uBlobB;
uniform sampler2D uLamp;

out vec4 fragColor;

const float SHELF_H   = 0.040;
const float FOOT_BOT  = 0.042;
const float WAIST_Y   = 0.235;
const float BASE_TOP  = 0.415;
const float GLASS_TOP = 0.845;
const float CAP_TOP   = 0.968;
const float GLASS_T   = 0.006;

const float INT_BOT   = 0.400;
const float INT_SPAN  = 0.480;

const int MAX_BLOBS = 10;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float ss(float a, float b, float x) { return smoothstep(a, b, x); }

float lampHalfW(float y) {
  if (y >= GLASS_TOP) {
    return mix(0.060, 0.046, (y - GLASS_TOP) / (CAP_TOP - GLASS_TOP));
  }
  if (y >= BASE_TOP) {
    float t = (y - BASE_TOP) / (GLASS_TOP - BASE_TOP);
    if (t < 0.07) {
      float s = t / 0.07;
      return mix(0.106, 0.1135, s * (2.0 - s));
    }
    float s = (t - 0.07) / 0.93;
    return mix(0.1135, 0.062, s);
  }
  if (y >= WAIST_Y) {
    float t = (y - WAIST_Y) / (BASE_TOP - WAIST_Y);
    return mix(0.052, 0.116, t);
  }

  float t = clamp((y - FOOT_BOT) / (WAIST_Y - FOOT_BOT), 0.0, 1.0);
  return mix(0.112, 0.052, t);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

vec3 silver(float m, float y, float seed) {
  vec3 c = mix(vec3(0.78, 0.80, 0.84), vec3(0.28, 0.30, 0.34), pow(m, 1.15));
  c += vec3(0.35) * exp(-pow(m - 0.25, 2.0) * 28.0) * 0.28;
  c *= 0.97 + 0.03 * vnoise(vec2(seed * 37.0, y * 120.0));
  return c;
}

vec3 roomColor(vec2 wallP, float inGridY) {
  float g = clamp(fract(wallP.y), 0.0, 1.0);

  vec3 dark = vec3(0.047, 0.043, 0.058) * (1.05 - 0.35 * g) * inGridY;
  dark += vec3(0.02, 0.018, 0.026) * vnoise(wallP * 5.0) * 0.5;

  vec3 lite = vec3(0.979, 0.975, 0.963);
  return mix(dark, lite, uLight);
}

vec3 shelfWood(vec2 wallP, vec2 q) {
  float grain = vnoise(vec2(wallP.x * 2.4, floor(wallP.y) * 13.7 + q.y * 90.0));
  float fine = vnoise(vec2(wallP.x * 40.0, floor(wallP.y) * 7.0));

  vec3 tone = mix(vec3(0.20, 0.117, 0.062), vec3(0.80, 0.76, 0.70), uLight);
  float grainAmt = mix(0.34, 0.08, uLight);
  vec3 wood = tone * (mix(0.72, 0.88, uLight) + grainAmt * grain) *
              (mix(0.9, 0.97, uLight) + mix(0.2, 0.06, uLight) * fine);
  wood += tone * mix(0.5, 0.15, uLight) * ss(SHELF_H - 0.012, SHELF_H, q.y);
  return wood;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 wallP = uCam.xy + uv * uCam.zw;

  float A = (uResolution.x / uResolution.y) * (uCam.w / uCam.z);
  vec2 cell = floor(wallP);
  vec2 p = fract(wallP);
  vec2 q = vec2((p.x - 0.5) * A, p.y);

  bool inGrid = wallP.x >= 0.0 && wallP.x < uGrid.x && wallP.y >= 0.0 &&
                wallP.y < uGrid.y;
  int lampIdx = int(cell.y) * int(uGrid.x) + int(cell.x);
  bool hasLamp = inGrid && lampIdx < uLampCount;

  vec3 col;
  if (inGrid) {
    col = q.y < SHELF_H ? shelfWood(wallP, q) : roomColor(wallP, 1.0);
  } else {
    col = roomColor(wallP, 0.6);
  }

  if (hasLamp) {
    vec4 lamp = texelFetch(uLamp, ivec2(lampIdx, 0), 0);
    float warmth = lamp.x;
    float hue = lamp.y;
    float switchedOn = lamp.z;
    float seed = lamp.w;
    vec3 liquidCol = texelFetch(uLamp, ivec2(lampIdx, 1), 0).rgb;

    vec3 waxCore = hsv2rgb(vec3(hue, 0.72, 1.05));
    vec3 waxMid  = hsv2rgb(vec3(hue, 0.88, 0.92));
    vec3 waxRim  = hsv2rgb(vec3(hue, 0.95, 0.55));
    float glowAmt = warmth * uGlow;

    vec2 bulbXY = vec2(0.0, INT_BOT - 0.01);

    if (q.y < SHELF_H + 0.02) {
      float sh = exp(-(q.x * q.x * 120.0 + pow((q.y - 0.045) * 10.0, 2.0)));
      col *= 1.0 - 0.55 * sh;
      col += waxMid * 0.12 * glowAmt *
             exp(-(q.x * q.x * 30.0 + pow((q.y - SHELF_H) * 7.0, 2.0)));
    } else {
      vec2 gq = (q - vec2(0.0, 0.55)) * vec2(1.7, 1.0);
      col += waxMid * 0.035 * glowAmt * exp(-dot(gq, gq) * 4.5);
    }

    float ax = abs(q.x);
    float hw = lampHalfW(q.y);

    float aaq = fwidth(q.y) + 1e-4;
    bool insideLamp = q.y > FOOT_BOT && q.y < CAP_TOP && ax < hw + aaq;

    if (insideLamp) {
      float edgeAA = ss(hw + aaq, hw - aaq, ax);
      vec3 lampCol;

      if (q.y >= BASE_TOP && q.y < GLASS_TOP) {
        float hwi = hw - GLASS_T;
        float xn = clamp(q.x / max(hwi, 1e-3), -1.0, 1.0);

        float centerGlow = pow(max(1.0 - xn * xn, 0.0), 1.1);
        float att = exp(-(q.y - INT_BOT) * 1.8);

        vec3 liq = liquidCol * (0.85 + 0.2 * centerGlow + 0.12 * att * glowAmt);

        vec2 qb = q - bulbXY;
        liq += waxCore * glowAmt * 0.14 * exp(-dot(qb, qb) * 140.0);

        lampCol = liq;

        {
          float lens = 0.94 + 0.10 * xn * xn;
          vec2 qs = vec2(q.x * lens, q.y);
          float f = 0.0;
          float hsum = 0.0;
          for (int b = 0; b < MAX_BLOBS; b++) {
            vec4 ba = texelFetch(uBlobA, ivec2(b, lampIdx), 0);
            vec4 bb = texelFetch(uBlobB, ivec2(b, lampIdx), 0);
            float act = bb.z;
            float rq = ba.z * INT_SPAN;
            vec2 bq;
            bq.y = INT_BOT + ba.y * INT_SPAN;
            float avail = max(lampHalfW(bq.y) - GLASS_T - 0.006 - rq * 0.55, 0.012);
            bq.x = ba.x * avail;
            vec2 d = qs - bq;
            float e = clamp(bb.y * 1.1, -0.15, 0.35);
            d.y /= (1.0 + 0.1 * max(e, 0.0));
            float dl = length(d) / max(rq, 1e-4);
            float c = act * max(0.0, 1.0 - dl * dl);
            c *= c;
            f += c;
            hsum += c * ba.w;
          }
          float heatL = hsum / max(f, 1e-4);
          float aa = max(fwidth(f) * 0.9, 0.04);
          float wax = ss(0.42 - aa, 0.42 + aa, f);

          if (wax > 0.003) {
            vec3 waxBody = mix(waxMid, waxCore, 0.35 + 0.4 * heatL);
            waxBody = mix(waxRim, waxBody, 0.82);
            float light = 0.92 + 0.08 * glowAmt;
            lampCol = mix(lampCol, waxBody * light, wax);
          }
        }

        lampCol *= 1.0 - 0.10 * exp(-max(hwi - ax, 0.0) * 40.0);

        float rim = exp(-(hw - ax) * 110.0);
        lampCol += vec3(0.75, 0.82, 0.92) * rim * (0.12 + 0.18 * glowAmt);

        float s1 = exp(-pow(q.x + hw * 0.48, 2.0) * 4200.0);
        lampCol += vec3(1.0) * s1 * (0.04 + 0.10 * glowAmt) *
                   ss(BASE_TOP, BASE_TOP + 0.06, q.y) *
                   (1.0 - ss(GLASS_TOP - 0.05, GLASS_TOP, q.y));
      } else {
        float m = ax / hw;
        lampCol = silver(m, q.y, seed);

        if (q.y < BASE_TOP) {
          lampCol *= 1.0 - 0.35 * exp(-pow((q.y - WAIST_Y) * 80.0, 2.0));
          lampCol += waxMid * glowAmt * 0.35 *
                     exp(-(BASE_TOP - q.y) * 22.0) * (1.0 - m * 0.6);

          vec2 sp = q - vec2(0.058, 0.330);
          float housing = sdRoundBox(sp, vec2(0.0135, 0.027), 0.005);
          float hMask = 1.0 - ss(0.0, 0.0025, housing);
          if (hMask > 0.0) {
            vec3 swCol = vec3(0.07);
            float well = sdRoundBox(sp, vec2(0.0095, 0.022), 0.004);
            float wMask = 1.0 - ss(0.0, 0.002, well);
            swCol = mix(swCol, vec3(0.025), wMask);

            float dir = switchedOn * 2.0 - 1.0;
            vec2 rp = sp - vec2(0.0, dir * 0.0105);
            float rocker = sdRoundBox(rp, vec2(0.008, 0.0115), 0.003);
            float rMask = 1.0 - ss(0.0, 0.0018, rocker);
            float tilt = ss(-0.012, 0.012, rp.y * dir);
            vec3 rockCol = vec3(0.13 + 0.17 * tilt);
            rockCol += vec3(0.12) * exp(-pow((rp.y - dir * 0.008) * 220.0, 2.0));
            swCol = mix(swCol, rockCol, rMask);

            lampCol = mix(lampCol, swCol, hMask);
          }
        } else {
          lampCol += waxMid * glowAmt * 0.12 *
                     (1.0 - ss(GLASS_TOP, GLASS_TOP + 0.05, q.y));
        }
      }

      col = mix(col, lampCol, edgeAA);
    }
  }

  vec2 vd = uv - 0.5;
  col *= 1.0 - 0.14 * dot(vd, vd) * (1.0 - uLight);
  col = pow(clamp(col, 0.0, 1.5), vec3(0.95));

  fragColor = vec4(col, 1.0);
}

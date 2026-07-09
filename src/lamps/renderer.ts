import { MAX_BLOBS } from "../params";
import type { LampWall } from "./lamp";
import fragSrc from "./shaders/lamp.frag?raw";
import vertSrc from "./shaders/quad.vert?raw";

export interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderState {
  time: number;
  detail: number;
  glow: number;

  light: number;
  rot: number;
  hero: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private texBlobA: WebGLTexture;
  private texBlobB: WebGLTexture;
  private texBlobC: WebGLTexture;
  private texLamp: WebGLTexture;
  private allocLamps = 0;
  private pixelBuf: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is required for the lamp wall");
    this.gl = gl;

    this.program = this.buildProgram(vertSrc, fragSrc);
    gl.useProgram(this.program);
    for (const name of [
      "uResolution",
      "uTime",
      "uCam",
      "uGrid",
      "uLampCount",
      "uDetail",
      "uGlow",
      "uLight",
      "uRot",
      "uHero",
      "uBlobA",
      "uBlobB",
      "uBlobC",
      "uLamp",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    gl.uniform1i(this.uniforms.uBlobA, 0);
    gl.uniform1i(this.uniforms.uBlobB, 1);
    gl.uniform1i(this.uniforms.uBlobC, 3);
    gl.uniform1i(this.uniforms.uLamp, 2);

    this.texBlobA = this.makeDataTexture();
    this.texBlobB = this.makeDataTexture();
    this.texBlobC = this.makeDataTexture();
    this.texLamp = this.makeDataTexture();
    this.resize();
  }

  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error("Shader compile error: " + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private makeDataTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.pixelBuf = null;
    }
    this.gl.viewport(0, 0, w, h);
  }

  get aspect(): number {
    return this.canvas.width / Math.max(this.canvas.height, 1);
  }

  render(wall: LampWall, cam: Camera, s: RenderState) {
    const gl = this.gl;
    gl.useProgram(this.program);

    const upload = (
      tex: WebGLTexture,
      unit: number,
      w: number,
      hRows: number,
      data: Float32Array,
      realloc: boolean,
    ) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (realloc) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          w,
          hRows,
          0,
          gl.RGBA,
          gl.FLOAT,
          data,
        );
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          w,
          hRows,
          gl.RGBA,
          gl.FLOAT,
          data,
        );
      }
    };
    const realloc = wall.count !== this.allocLamps;
    upload(this.texBlobA, 0, MAX_BLOBS, wall.count, wall.blobA, realloc);
    upload(this.texBlobB, 1, MAX_BLOBS, wall.count, wall.blobB, realloc);
    upload(this.texBlobC, 3, MAX_BLOBS, wall.count, wall.blobC, realloc);
    upload(this.texLamp, 2, wall.count, 2, wall.lampData, realloc);
    this.allocLamps = wall.count;

    gl.uniform2f(
      this.uniforms.uResolution,
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform1f(this.uniforms.uTime, s.time);
    gl.uniform4f(this.uniforms.uCam, cam.x, cam.y, cam.w, cam.h);
    gl.uniform2f(this.uniforms.uGrid, wall.cols, wall.rows);
    gl.uniform1i(this.uniforms.uLampCount, wall.count);
    gl.uniform1f(this.uniforms.uDetail, s.detail);
    gl.uniform1f(this.uniforms.uGlow, s.glow);
    gl.uniform1f(this.uniforms.uLight, s.light);
    gl.uniform1f(this.uniforms.uRot, s.rot);
    gl.uniform1i(this.uniforms.uHero, s.hero);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  readPixels(): Uint8Array {
    const gl = this.gl;
    const n = this.canvas.width * this.canvas.height * 4;
    if (!this.pixelBuf || this.pixelBuf.length !== n) {
      this.pixelBuf = new Uint8Array(n);
    }
    gl.readPixels(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.pixelBuf,
    );
    return this.pixelBuf;
  }
}

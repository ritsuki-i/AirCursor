import type { FieldState } from "./gravity";
import type { ParticleField } from "./particle-field";
import { coreFragment, coreVertex, pointFragment, pointVertex, trailFragment, trailVertex } from "./light-shaders";

export interface FieldRenderer {
  resize(width: number, height: number, dpr: number): void;
  draw(field: ParticleField, state: FieldState, reduced: boolean): void;
  dispose(): void;
}
type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; attributes: Record<string, number> };

export class WebGLFieldRenderer implements FieldRenderer {
  private gl: WebGLRenderingContext;
  private points: Program;
  private trails: Program;
  private core: Program;
  private buffers: WebGLBuffer[] = [];
  private shaders: WebGLShader[] = [];
  private dpr = 1;
  private height = 1000;
  private pointCapacity = 0;
  private trailCapacity = 0;
  private cloud: WebGLTexture;

  constructor(private canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "high-performance" }) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    this.points = this.createProgram(pointVertex, pointFragment, ["aspect", "dpr", "height", "time", "reduced", "cloud"], ["position", "style", "pulse"]);
    // Bake the soft cloud once, instead of evaluating procedural noise for
    // millions of gas-fragment pixels on every frame (and every light).
    const cloud = gl.createTexture();
    if (!cloud) throw new Error('Texture unavailable');
    this.cloud = cloud;
    const pixels = new Uint8Array(64 * 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const px = x / 63 - .5, py = y / 63 - .5, r = Math.hypot(px, py);
      const edge = Math.max(0, Math.min(1, (.5 - r) / .23));
      const noise = .6 + .15 * Math.sin(px * 25 + Math.sin(py * 19)) + .12 * Math.cos(py * 37 + px * 16);
      pixels[y * 64 + x] = Math.round(255 * Math.exp(-r * r * 14) * edge * edge * (3 - 2 * edge) * noise);
    }
    gl.bindTexture(gl.TEXTURE_2D, cloud);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 64, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.trails = this.createProgram(trailVertex, trailFragment, ["aspect"], ["position", "light"]);
    this.core = this.createProgram(coreVertex, coreFragment, ["resolution", "center", "energy", "release", "flash", "reduced"], ["position"]);
    for (let i = 0; i < 3; i++) { const buffer = gl.createBuffer(); if (!buffer) throw new Error("Buffer unavailable"); this.buffers.push(buffer); }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[2]);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
  }

  private createProgram(vertex: string, fragment: string, uniforms: string[], attributes: string[]): Program {
    const gl = this.gl, program = gl.createProgram();
    if (!program) throw new Error("Program unavailable");
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type); if (!shader) throw new Error("Shader unavailable");
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
      this.shaders.push(shader); gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Program linking failed");
    return { program,
      uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, `u_${name}`)])),
      attributes: Object.fromEntries(attributes.map(name => [name, gl.getAttribLocation(program, `a_${name}`)])),
    };
  }
  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr; this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  private attribute(location: number, size: number, stride: number, offset: number) {
    if (location < 0) return;
    this.gl.enableVertexAttribArray(location);
    this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, stride * 4, offset * 4);
  }
  private disableAttributes() {
    for (let i = 0; i < 3; i++) this.gl.disableVertexAttribArray(i);
  }
  draw(field: ParticleField, state: FieldState, reduced: boolean) {
    const gl = this.gl, { points, vertices } = field.pack(state, reduced);
    gl.clearColor(.004,.009,.024,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.points.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.cloud);
    gl.uniform1i(this.points.uniforms.cloud, 0);
    gl.uniform1f(this.points.uniforms.aspect, field.aspect);
    gl.uniform1f(this.points.uniforms.dpr, this.dpr);
    gl.uniform1f(this.points.uniforms.height, this.height);
    gl.uniform1f(this.points.uniforms.time, reduced ? 0 : field.time);
    gl.uniform1f(this.points.uniforms.reduced, reduced ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]);
    if (this.pointCapacity !== field.pointData.byteLength) {
      this.pointCapacity = field.pointData.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.pointCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, field.pointData);
    this.attribute(this.points.attributes.position, 3, 9, 0);
    this.attribute(this.points.attributes.style, 4, 9, 3);
    this.attribute(this.points.attributes.pulse, 2, 9, 7);
    gl.drawArrays(gl.POINTS, 0, points);
    this.disableAttributes();

    gl.useProgram(this.trails.program);
    gl.uniform1f(this.trails.uniforms.aspect, field.aspect);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[1]);
    if (this.trailCapacity !== field.trailData.byteLength) {
      this.trailCapacity = field.trailData.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.trailCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, field.trailData.subarray(0, vertices * 6));
    this.attribute(this.trails.attributes.position, 3, 6, 0);
    this.attribute(this.trails.attributes.light, 3, 6, 3);
    gl.drawArrays(gl.TRIANGLES, 0, vertices);
    this.disableAttributes();

    gl.useProgram(this.core.program);
    gl.blendFunc(gl.ONE, gl.ONE);
    const energy = reduced ? state.compression * .15 : state.phase === "rupture" || state.phase === "afterglow" ? field.releasedEnergy * state.glow : field.captureFraction;
    gl.uniform2f(this.core.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.core.uniforms.center, field.centerX, field.centerY);
    gl.uniform1f(this.core.uniforms.energy, energy);
    gl.uniform1f(this.core.uniforms.release, state.release);
    gl.uniform1f(this.core.uniforms.flash, reduced ? 0 : state.glow);
    gl.uniform1f(this.core.uniforms.reduced, reduced ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[2]);
    this.attribute(this.core.attributes.position, 2, 2, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.disableAttributes();
  }
  dispose() {
    const gl = this.gl;
    this.shaders.forEach(shader => gl.deleteShader(shader));
    this.buffers.forEach(buffer => gl.deleteBuffer(buffer));
    gl.deleteTexture(this.cloud);
    [this.points, this.trails, this.core].forEach(item => gl.deleteProgram(item.program));
  }
}

// These shaders draw individual bodies and their recorded paths. They never
// generate a galaxy, rotate a field texture, or remap the scene around the hand.
const palette = `
vec3 lightColor(float hue) {
  if (hue < .28) return mix(vec3(.16,.32,1.0),vec3(.20,.86,1.0),hue/.28);
  if (hue < .60) return mix(vec3(.38,.19,1.0),vec3(.92,.36,.78),(hue-.28)/.32);
  if (hue < .82) return mix(vec3(1.0,.66,.36),vec3(1.0,.87,.68),(hue-.60)/.22);
  return vec3(.82,.94,1.0);
}
`;
const projection = `
vec2 project(vec3 p) {
  float perspective = 1.0/max(.55,1.0+p.z*.32);
  return vec2(p.x/u_aspect,p.y)*2.0*perspective;
}
${palette}
`;

export const pointVertex = `
precision highp float;
attribute vec3 a_position;
attribute vec4 a_style;
attribute vec2 a_pulse;
uniform float u_aspect;
uniform float u_dpr;
uniform float u_height;
uniform float u_time;
uniform float u_reduced;
varying vec4 v_style;
varying float v_phase;
${projection}
void main() {
  vec2 projected = project(a_position);
  gl_Position = vec4(projected,0.0,1.0);
  float depth = 1.0/max(.55,1.0+a_position.z*.32);
  float isGas = step(2.5,a_style.w);
  gl_PointSize = max(1.0,a_style.x*u_dpr*depth*mix(1.0,u_height/1000.0,isGas));
  float pulse = mix(.66+.34*sin(u_time*a_pulse.y+a_pulse.x),1.0,u_reduced);
  float veil = mix(.40,1.0,smoothstep(-.92,.10,projected.x));
  v_style = vec4(a_style.x,a_style.y*pulse*veil,a_style.z,a_style.w);
  v_phase = a_pulse.x;
}
`;

export const pointFragment = `
precision highp float;
varying vec4 v_style;
varying float v_phase;
uniform float u_time;
${palette}
uniform sampler2D u_cloud;
void main() {
  vec2 p=gl_PointCoord-.5;
  float radius=length(p);
  if(radius>.5) discard;
  float alpha=0.0;
  vec3 color=lightColor(v_style.z);
  if(v_style.w>2.5) {
    alpha=texture2D(u_cloud,gl_PointCoord).r;
    color=lightColor(v_style.z)*.85;
  } else if(v_style.w>1.5) {
    float angle=v_phase+u_time*(.12+v_style.z*.2);
    p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
    float diamond=abs(p.x)*2.8+abs(p.y)*1.5;
    alpha=(1.0-smoothstep(.15,.6,diamond))*.9+exp(-radius*radius*24.0)*.25;
  } else {
    alpha=exp(-radius*radius*34.0)+exp(-radius*radius*8.0)*.20;
    if(v_style.w>.5) {
      alpha+=exp(-abs(p.x)*65.0-abs(p.y)*10.0)*.23;
      alpha+=exp(-abs(p.y)*65.0-abs(p.x)*10.0)*.23;
    }
    alpha*=1.0-smoothstep(.32,.50,radius);
  }
  gl_FragColor=vec4(color,alpha*v_style.y);
}
`;

export const trailVertex = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_light;
uniform float u_aspect;
varying vec4 v_color;
varying float v_edge;
${projection}
void main() {
  vec2 p=project(a_position);
  gl_Position=vec4(p,0.0,1.0);
  float veil=mix(.30,1.0,smoothstep(-.9,.1,p.x));
  v_color=vec4(lightColor(a_light.y),a_light.x*veil);
  v_edge=a_light.z;
}
`;
export const trailFragment = `
precision highp float;
varying vec4 v_color;
varying float v_edge;
void main() { gl_FragColor=vec4(v_color.rgb,v_color.a*exp(-v_edge*v_edge*4.0)); }
`;

export const coreVertex = `
attribute vec2 a_position;
void main(){gl_Position=vec4(a_position,0.0,1.0);}
`;
export const coreFragment = `
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_energy;
uniform float u_release;
uniform float u_flash;
uniform float u_reduced;
void main(){
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.0)-u_center;
  float r=length(p);
  float core=exp(-r*r/.000015)*u_energy;
  float halo=exp(-r*r/.0018)*u_energy*.075;
  float cross=(exp(-abs(p.x)*13.0-abs(p.y)*1800.0)+exp(-abs(p.y)*25.0-abs(p.x)*1800.0))*u_energy*.11;
  float ring=exp(-abs(r-.040)*950.0)*u_energy*.065;
  float shock=exp(-pow((r-u_release*1.7)/.016,2.0))*u_flash*.13*(1.0-u_reduced);
  float flash=exp(-r*6.0)*u_flash*.24*(1.0-u_reduced);
  vec3 color=vec3(.83,.93,1.0)*core+vec3(.18,.41,1.0)*(halo+cross+ring+shock)+vec3(.7,.85,1.0)*flash;
  gl_FragColor=vec4(color,1.0);
}
`;

var se=Object.defineProperty;var ae=(i,t,s)=>t in i?se(i,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):i[t]=s;var d=(i,t,s)=>ae(i,typeof t!="symbol"?t+"":t,s);var O=`
vec3 lightColor(float hue) {
  if (hue < .28) return mix(vec3(.16,.32,1.0),vec3(.20,.86,1.0),hue/.28);
  if (hue < .60) return mix(vec3(.38,.19,1.0),vec3(.92,.36,.78),(hue-.28)/.32);
  if (hue < .82) return mix(vec3(1.0,.66,.36),vec3(1.0,.87,.68),(hue-.60)/.22);
  return vec3(.82,.94,1.0);
}
`,N=`
vec2 project(vec3 p) {
  float perspective = 1.0/max(.55,1.0+p.z*.32);
  return vec2(p.x/u_aspect,p.y)*2.0*perspective;
}
${O}
`,q=`
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
${N}
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
`,W=`
precision highp float;
varying vec4 v_style;
varying float v_phase;
uniform float u_time;
${O}
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
`,j=`
precision highp float;
attribute vec3 a_position;
attribute vec3 a_light;
uniform float u_aspect;
varying vec4 v_color;
varying float v_edge;
${N}
void main() {
  vec2 p=project(a_position);
  gl_Position=vec4(p,0.0,1.0);
  float veil=mix(.30,1.0,smoothstep(-.9,.1,p.x));
  v_color=vec4(lightColor(a_light.y),a_light.x*veil);
  v_edge=a_light.z;
}
`,V=`
precision highp float;
varying vec4 v_color;
varying float v_edge;
void main() { gl_FragColor=vec4(v_color.rgb,v_color.a*exp(-v_edge*v_edge*4.0)); }
`,H=`
attribute vec2 a_position;
void main(){gl_Position=vec4(a_position,0.0,1.0);}
`,K=`
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
`;var z=class{constructor(t){this.canvas=t;this.buffers=[];this.shaders=[];this.dpr=1;this.height=1e3;this.pointCapacity=0;this.trailCapacity=0;let s=t.getContext("webgl",{alpha:!1,antialias:!1,depth:!1,powerPreference:"high-performance"});if(!s)throw new Error("WebGL unavailable");this.gl=s,this.points=this.createProgram(q,W,["aspect","dpr","height","time","reduced","cloud"],["position","style","pulse"]);let n=s.createTexture();if(!n)throw new Error("Texture unavailable");this.cloud=n;let r=new Uint8Array(64*64);for(let o=0;o<64;o++)for(let a=0;a<64;a++){let e=a/63-.5,l=o/63-.5,h=Math.hypot(e,l),f=Math.max(0,Math.min(1,(.5-h)/.23)),m=.6+.15*Math.sin(e*25+Math.sin(l*19))+.12*Math.cos(l*37+e*16);r[o*64+a]=Math.round(255*Math.exp(-h*h*14)*f*f*(3-2*f)*m)}s.bindTexture(s.TEXTURE_2D,n),s.texImage2D(s.TEXTURE_2D,0,s.LUMINANCE,64,64,0,s.LUMINANCE,s.UNSIGNED_BYTE,r),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),this.trails=this.createProgram(j,V,["aspect"],["position","light"]),this.core=this.createProgram(H,K,["resolution","center","energy","release","flash","reduced"],["position"]);for(let o=0;o<3;o++){let a=s.createBuffer();if(!a)throw new Error("Buffer unavailable");this.buffers.push(a)}s.bindBuffer(s.ARRAY_BUFFER,this.buffers[2]),s.bufferData(s.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),s.STATIC_DRAW),s.enable(s.BLEND),s.blendFunc(s.SRC_ALPHA,s.ONE),s.disable(s.DEPTH_TEST)}createProgram(t,s,n,r){let o=this.gl,a=o.createProgram();if(!a)throw new Error("Program unavailable");for(let[e,l]of[[o.VERTEX_SHADER,t],[o.FRAGMENT_SHADER,s]]){let h=o.createShader(e);if(!h)throw new Error("Shader unavailable");if(o.shaderSource(h,l),o.compileShader(h),!o.getShaderParameter(h,o.COMPILE_STATUS))throw new Error(o.getShaderInfoLog(h)||"Shader compilation failed");this.shaders.push(h),o.attachShader(a,h)}if(o.linkProgram(a),!o.getProgramParameter(a,o.LINK_STATUS))throw new Error(o.getProgramInfoLog(a)||"Program linking failed");return{program:a,uniforms:Object.fromEntries(n.map(e=>[e,o.getUniformLocation(a,`u_${e}`)])),attributes:Object.fromEntries(r.map(e=>[e,o.getAttribLocation(a,`a_${e}`)]))}}resize(t,s,n){this.dpr=n,this.height=s,this.canvas.width=Math.max(1,Math.round(t*n)),this.canvas.height=Math.max(1,Math.round(s*n)),this.gl.viewport(0,0,this.canvas.width,this.canvas.height)}attribute(t,s,n,r){t<0||(this.gl.enableVertexAttribArray(t),this.gl.vertexAttribPointer(t,s,this.gl.FLOAT,!1,n*4,r*4))}disableAttributes(){for(let t=0;t<3;t++)this.gl.disableVertexAttribArray(t)}draw(t,s,n){let r=this.gl,{points:o,vertices:a}=t.pack(s,n);r.clearColor(.004,.009,.024,1),r.clear(r.COLOR_BUFFER_BIT),r.blendFunc(r.SRC_ALPHA,r.ONE),r.useProgram(this.points.program),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,this.cloud),r.uniform1i(this.points.uniforms.cloud,0),r.uniform1f(this.points.uniforms.aspect,t.aspect),r.uniform1f(this.points.uniforms.dpr,this.dpr),r.uniform1f(this.points.uniforms.height,this.height),r.uniform1f(this.points.uniforms.time,n?0:t.time),r.uniform1f(this.points.uniforms.reduced,n?1:0),r.bindBuffer(r.ARRAY_BUFFER,this.buffers[0]),this.pointCapacity!==t.pointData.byteLength&&(this.pointCapacity=t.pointData.byteLength,r.bufferData(r.ARRAY_BUFFER,this.pointCapacity,r.DYNAMIC_DRAW)),r.bufferSubData(r.ARRAY_BUFFER,0,t.pointData),this.attribute(this.points.attributes.position,3,9,0),this.attribute(this.points.attributes.style,4,9,3),this.attribute(this.points.attributes.pulse,2,9,7),r.drawArrays(r.POINTS,0,o),this.disableAttributes(),r.useProgram(this.trails.program),r.uniform1f(this.trails.uniforms.aspect,t.aspect),r.bindBuffer(r.ARRAY_BUFFER,this.buffers[1]),this.trailCapacity!==t.trailData.byteLength&&(this.trailCapacity=t.trailData.byteLength,r.bufferData(r.ARRAY_BUFFER,this.trailCapacity,r.DYNAMIC_DRAW)),r.bufferSubData(r.ARRAY_BUFFER,0,t.trailData.subarray(0,a*6)),this.attribute(this.trails.attributes.position,3,6,0),this.attribute(this.trails.attributes.light,3,6,3),r.drawArrays(r.TRIANGLES,0,a),this.disableAttributes(),r.useProgram(this.core.program),r.blendFunc(r.ONE,r.ONE);let e=n?s.compression*.15:s.phase==="rupture"||s.phase==="afterglow"?t.releasedEnergy*s.glow:t.captureFraction;r.uniform2f(this.core.uniforms.resolution,this.canvas.width,this.canvas.height),r.uniform2f(this.core.uniforms.center,t.centerX,t.centerY),r.uniform1f(this.core.uniforms.energy,e),r.uniform1f(this.core.uniforms.release,s.release),r.uniform1f(this.core.uniforms.flash,n?0:s.glow),r.uniform1f(this.core.uniforms.reduced,n?1:0),r.bindBuffer(r.ARRAY_BUFFER,this.buffers[2]),this.attribute(this.core.attributes.position,2,2,0),r.drawArrays(r.TRIANGLES,0,6),this.disableAttributes()}dispose(){let t=this.gl;this.shaders.forEach(s=>t.deleteShader(s)),this.buffers.forEach(s=>t.deleteBuffer(s)),t.deleteTexture(this.cloud),[this.points,this.trails,this.core].forEach(s=>t.deleteProgram(s.program))}};var $=()=>({x:.69,y:.51,detected:!1,pressed:!1,launch:!1,demo:!1}),Z=()=>({phase:"ambient",elapsed:0,time:0,x:.69,y:.51,influence:0,compression:0,release:0,glow:0,armed:!0}),J=i=>Math.max(0,Math.min(1,i)),U=i=>{let t=J(i);return t*t*(3-2*t)};function _(i,t){i.phase=t,i.elapsed=0}function Q(i,t,s,n){let r=Math.min(Math.max(s,0),.05);i.elapsed+=r;let o=t.launch;if(t.launch=!1,o&&["attraction","compression","silence"].includes(i.phase)&&(i.glow=1,i.release=0,_(i,"rupture")),i.time+=r*(i.phase==="silence"?.18:1+i.compression*1.2),!["rupture","afterglow"].includes(i.phase)){let l=1-Math.exp(-r*5);i.x+=(t.x-i.x)*l,i.y+=(t.y-i.y)*l}!t.pressed&&!t.demo&&(i.armed=!0),i.phase==="ambient"||i.phase==="detection"?(i.compression=0,i.release=0,i.glow=0,(t.pressed||t.demo)&&i.armed?(i.armed=!1,_(i,"attraction")):t.detected&&i.phase==="ambient"?_(i,"detection"):!t.detected&&i.phase==="detection"&&_(i,"ambient")):i.phase==="attraction"?(i.compression=.18*U(i.elapsed/.75),!t.pressed&&!t.demo?_(i,"afterglow"):i.elapsed>=.75&&_(i,"compression")):i.phase==="compression"?(i.compression=.18+.82*U(i.elapsed/1.25),!t.pressed&&!t.demo?_(i,"afterglow"):i.elapsed>=1.25&&(!n||n.captureFraction>=.94||i.elapsed>=2.6)&&(i.compression=1,_(i,"silence"))):i.phase==="silence"?!t.pressed&&!t.demo&&_(i,"afterglow"):i.phase==="rupture"?(i.release=J(i.elapsed/.85),i.compression=1-U(i.release),i.glow=Math.exp(-i.elapsed*5),i.elapsed>=.85&&_(i,"afterglow")):i.phase==="afterglow"&&(i.compression*=Math.exp(-r*4),i.glow*=Math.exp(-r*2),i.release=Math.min(2,i.release+r*.4),i.elapsed>=3.2&&(t.demo=!1,_(i,"ambient")));let e=i.phase==="ambient"?0:i.phase==="detection"?.3:i.phase==="afterglow"?0:1;return i.phase!=="silence"&&(i.influence+=(e-i.influence)*(1-Math.exp(-r*3))),i}var I={stars:1800,dust:10400,glints:1300,fragments:180,streams:300,gas:56},ee={stars:900,dust:4600,glints:680,fragments:90,streams:160,gas:36},te={stars:440,dust:1700,glints:360,fragments:60,streams:90,gas:24},de=1/120,B=Math.PI*2,ne=(i,t,s)=>Math.max(t,Math.min(s,i));function oe(i){return()=>(i^=i<<13,i^=i>>>17,i^=i<<5,(i>>>0)/4294967296)}var D=class{constructor(t=I,s=1.44,n=1701){this.lights=[];this.streams=[];this.time=0;this.capturedCount=0;this.previousPhase="ambient";this.centerX=0;this.centerY=0;this.historyTime=0;this.flow=new Float64Array(3);this.captureAtRelease=0;this.aspect=s;let r=oe(n),o=(a,e)=>{for(let l=0;l<e;l++){let h=this.lights.length,f=r()*B,m=Math.floor(r()*3),E=r()+r()+r()-1.5,y=.39+m*.21+E*.15,b=.21*s+Math.cos(f)*y+.07*Math.sin(f*2+m),v=-.015+Math.sin(f)*y*.62+.14*Math.sin(f*2+m*.5),M=(r()-.5)*.65+Math.cos(f+m)*.12,c=r()*B,g=r()*B,w=(r()-.5)*1.2,u={id:h,kind:a,x:a==="star"?(r()-.5)*s*1.35:b,y:a==="star"?(r()-.5)*1.35:v,z:a==="star"?.4+r()*1.2:M,vx:0,vy:0,vz:0,hx:b,hy:v,hz:M,response:.72+r()*.95,drag:.7+r()*1.9,swirl:r()<.22?.03:.25+r()*.95,size:a==="gas"?240+r()*280:a==="fragment"?4+r()*5:a==="glint"?4+r()*6:1.2+r()*2.5,brightness:a==="gas"?.24+r()*.2:a==="dust"?.42+r()*.75:.65+r()*.9,hue:r(),phase:c,pulseRate:.3+r()*1.1,launchSpeed:.22+Math.pow(r(),1.2)*1.7,launchDelay:r()*.12,lifetime:.75+r()*3.5,launchX:Math.cos(g),launchY:Math.sin(g),launchZ:w,captured:!1,releaseAge:-1,released:!1,alpha:1};if(this.ambientVelocity(u.x,u.y,u.z,c,this.flow),u.vx=this.flow[0]*u.response,u.vy=this.flow[1]*u.response,u.vz=this.flow[2],this.lights.push(u),a==="stream"){let A=54+Math.floor(r()*35),P=new Float32Array(A*3),x=u.x,F=u.y,R=u.z;for(let T=0;T<A;T++){let S=(A-1-T)*3;P[S]=x,P[S+1]=F,P[S+2]=R,this.ambientVelocity(x,F,R,c,this.flow),x-=this.flow[0]*.075*u.response,F-=this.flow[1]*.075*u.response,R-=this.flow[2]*.075}this.streams.push({light:u,history:P,length:A,head:A-1})}}};o("gas",t.gas),o("star",t.stars),o("dust",t.dust),o("glint",t.glints),o("fragment",t.fragments),o("stream",t.streams),this.gasCount=t.gas,this.reactiveCount=this.lights.filter(a=>a.kind!=="star"&&a.kind!=="gas").length,this.pointData=new Float32Array(this.lights.length*9),this.trailData=new Float32Array(this.streams.reduce((a,e)=>a+(e.length-1)*6*6,0))}get captureFraction(){return this.capturedCount/Math.max(1,this.reactiveCount)}ambientVelocity(t,s,n,r,o){let a=t-this.aspect*.21,e=s+.015,l=Math.sqrt(a*a+e*e*2.5+.018),h=t*3.1+n*1.7+this.time*.045,f=s*4.3-n*.9-this.time*.038;o[0]=-e*.072/(l+.2)+Math.sin(h)*Math.sin(f)*.013,o[1]=a*.032/(l+.2)+Math.cos(h)*Math.cos(f)*.009,o[2]=Math.sin(t*2.4+s*3.1+r+this.time*.13)*.007}step(t,s){let n=Math.min(s,.03333333333333333);if(this.centerX=(t.x-.5)*this.aspect,this.centerY=.5-t.y,t.phase==="silence"){this.time+=n*.18;let e=0;for(let l of this.lights)l.kind==="star"?(l.x+=Math.sin(l.phase+this.time*.09)*8e-5*n,l.y+=Math.cos(l.phase+this.time*.07)*6e-5*n):l.captured&&(l.x=this.centerX+l.launchX*.002,l.y=this.centerY+l.launchY*.002,l.z=l.launchZ*.002,l.alpha=l.kind==="gas"?.02:.15,l.kind!=="gas"&&e++);this.capturedCount=e,this.previousPhase=t.phase;return}if(this.time+=n,t.phase==="rupture"&&this.previousPhase!=="rupture"){this.captureAtRelease=this.captureFraction;for(let e of this.lights)e.kind!=="star"&&(e.releaseAge=-e.launchDelay,e.released=!1)}let r=t.phase==="attraction"||t.phase==="compression",o=t.phase==="rupture"||t.phase==="afterglow",a=0;for(let e of this.lights){if(e.kind==="star"){e.x+=Math.sin(e.phase+this.time*.09)*25e-5*n,e.y+=Math.cos(e.phase+this.time*.07)*18e-5*n;continue}let l=this.centerX-e.x,h=this.centerY-e.y,f=-e.z,m=l*l+h*h+f*f*.4,E=Math.sqrt(m+1e-6);if(e.captured&&r){e.x=this.centerX+e.launchX*.002,e.y=this.centerY+e.launchY*.002,e.z=e.launchZ*.002,e.alpha=e.kind==="gas"?.02:.15,e.kind!=="gas"&&a++;continue}if(o&&e.releaseAge>-1){if(e.releaseAge+=n,e.releaseAge>=0&&!e.released){let c=e.captured?1:1/(1+E*3);e.vx=e.launchX*e.launchSpeed*c+e.vx*.12,e.vy=e.launchY*e.launchSpeed*c+e.vy*.12,e.vz=e.launchZ*e.launchSpeed*c,e.captured=!1,e.released=!0}if(e.captured){e.kind!=="gas"&&a++;continue}}else r||(e.captured=!1);this.ambientVelocity(e.x,e.y,e.z,e.phase,this.flow);let y=(this.flow[0]*e.response-e.vx)*.7,b=(this.flow[1]*e.response-e.vy)*.7,v=(this.flow[2]-e.vz)*.7;if(r){let g=(.3+t.compression*t.compression*4.5)*e.response/(.085+m),w=Math.sqrt(g)*(1.35+e.drag*.13),u=e.swirl*(1-t.compression*.85)*g*.3;if(y=l*g-h*u-e.vx*w,b=h*g+l*u-e.vy*w,v=f*g-e.vz*w,E<.012+t.compression*.01&&t.compression>.2){e.captured=!0,e.alpha=.15,e.kind!=="gas"&&a++;continue}}else if(t.phase==="detection"){let c=Math.exp(-m/.065)*.26*e.response;y+=l*c-h*c*e.swirl,b+=h*c+l*c*e.swirl,v+=f*c}if(o&&e.released){let c=t.phase==="afterglow"?ne((t.elapsed-.2)/2,0,1):0,g=e.drag*.55+c*2;y=-e.vx*g+(e.hx-e.x)*c*(1.5+e.response),b=-e.vy*g+(e.hy-e.y)*c*(1.5+e.response),v=-e.vz*g+(e.hz-e.z)*c*2,y-=e.vy*e.swirl*.65,b+=e.vx*e.swirl*.65;let w=Math.exp(-Math.max(0,e.releaseAge)/e.lifetime);e.alpha=w*(e.kind==="fragment"?1.8:1.25)+c*.7}else r||(y+=(e.hx+Math.sin(this.time*.07+e.phase)*.1-e.x)*.018,b+=(e.hy+Math.cos(this.time*.09+e.phase)*.055-e.y)*.018,v+=(e.hz-e.z)*.05),e.alpha+=(1-e.alpha)*Math.min(1,n*3),e.releaseAge>=0&&(e.releaseAge=-1,e.released=!1);e.vx+=y*n,e.vy+=b*n,e.vz+=v*n;let M=Math.sqrt(e.vx*e.vx+e.vy*e.vy+e.vz*e.vz);if(M>4.5){let c=4.5/M;e.vx*=c,e.vy*=c,e.vz*=c}e.x+=e.vx*n,e.y+=e.vy*n,e.z+=e.vz*n}if(this.capturedCount=a,this.historyTime+=n,this.historyTime>=.045){this.historyTime%=.045;for(let e of this.streams){if(e.light.captured)for(let h=0;h<e.length;h++)e.history[h*3]=e.light.x,e.history[h*3+1]=e.light.y,e.history[h*3+2]=e.light.z;e.head=(e.head+1)%e.length;let l=e.head*3;e.history[l]=e.light.x,e.history[l+1]=e.light.y,e.history[l+2]=e.light.z}}this.previousPhase=t.phase}pack(t,s){let n=0,r=t.phase==="silence";for(let a of this.lights){let e=a.kind==="gas"?3:a.kind==="fragment"?2:a.kind==="glint"?1:0,l=a.alpha*a.brightness*(r&&a.kind==="star"?.08:1),h=this.pointData;h[n++]=a.x,h[n++]=a.y,h[n++]=a.z,h[n++]=a.size,h[n++]=l,h[n++]=a.hue,h[n++]=e,h[n++]=a.phase,h[n++]=a.pulseRate}let o=0;for(let a of this.streams){let e=a.light,l=e.brightness*e.alpha*(e.captured?.006:1)*(r?.02:1)*(s?.5:1),h=e.released?Math.min(a.length,4+Math.floor(e.lifetime*3)):a.length,f=e.released?1:3;for(let m=0;m<h-1;m+=f){let E=Math.min(m+f,h-1),y=(a.head-m+a.length)%a.length*3,b=(a.head-E+a.length)%a.length*3,v=Math.max(.55,1+a.history[y+2]*.32),M=Math.max(.55,1+a.history[b+2]*.32),c=a.history[b]/M-a.history[y]/v,g=a.history[b+1]/M-a.history[y+1]/v,w=Math.hypot(c,g)+1e-6,u=65e-5+e.hue*55e-5,A=-g/w*u,P=c/w*u;for(let x=0;x<6;x++){let F=x===2||x===4||x===5?1:0,R=x===0||x===3||x===5?-1:1,T=F?b:y,S=F?M:v,ie=Math.pow(1-(F?E:m)/(h-1),1.6);this.trailData[o++]=a.history[T]+A*R*S,this.trailData[o++]=a.history[T+1]+P*R*S,this.trailData[o++]=a.history[T+2],this.trailData[o++]=l*ie*.78,this.trailData[o++]=e.hue,this.trailData[o++]=R}}}return{points:this.lights.length,vertices:o/6}}get releasedEnergy(){return this.captureAtRelease}};var L=class{constructor(t,s,n,r=!1){this.renderer=t;this.fallback=r;d(this,"state",Z());d(this,"input",$());d(this,"particles");d(this,"paused",!1);d(this,"reduced",!1);d(this,"tracking",!1);d(this,"visible",!0);d(this,"dirty",!0);d(this,"previous",0);d(this,"accumulator",0);d(this,"width",1);d(this,"height",1);d(this,"dpr",1);d(this,"quality",1);d(this,"slow",0);d(this,"fast",0);d(this,"pressure",0);d(this,"renderScale",1);this.particles=new D(r?te:s<650?ee:I,s/n)}resize(t=this.width,s=this.height,n=this.dpr){this.width=Math.max(1,t),this.height=Math.max(1,s),this.dpr=n,this.particles.aspect=this.width/this.height;let r=11e5/(1+this.pressure*.28);this.renderScale=this.quality*Math.min(n,1.25,Math.sqrt(r/(this.width*this.height))),this.renderer.resize(this.width,this.height,this.renderScale),this.dirty=!0}update(t){if(t.input){let{demo:s,launch:n,...r}=t.input;Object.assign(this.input,r)}t.visible!==void 0&&t.visible!==this.visible&&(this.visible=t.visible,this.previous=0),t.paused!==void 0&&(this.paused=t.paused),t.reduced!==void 0&&this.reduced!==t.reduced&&(this.reduced=t.reduced,this.dirty=!0),t.tracking!==void 0&&this.tracking!==t.tracking&&(this.tracking=t.tracking,this.resize()),t.pressure!==void 0&&t.pressure!==this.pressure&&(this.pressure=t.pressure,this.resize()),t.play&&(["attraction","compression","silence"].includes(this.state.phase)?this.input.launch=!0:["ambient","detection"].includes(this.state.phase)&&(this.input.demo=!0,this.state.armed=!0)),t.release&&(this.input.pressed=!1,this.input.launch=!0)}frame(t){if(!this.visible||(this.paused||this.reduced)&&!this.dirty)return this.previous=0,!1;let s=this.fallback?24:this.tracking?45:60,n=1e3/Math.max(24,s-this.pressure*8);if(!this.dirty&&t-this.previous<n-1)return!1;let r=this.previous?Math.min((t-this.previous)/1e3,.05):1/60;this.previous=t;let o=performance.now();if(!this.paused&&!this.reduced)for(this.accumulator=Math.min(this.accumulator+r,1/30);this.accumulator>=1/60;)Q(this.state,this.input,1/60,this.particles),this.particles.step(this.state,1/60),this.accumulator-=1/60;this.renderer.draw(this.particles,this.state,this.reduced),this.dirty=!1;let a=performance.now()-o;return a>n*.82?(this.slow++,this.fast=0):(this.slow=Math.max(0,this.slow-1),this.fast=a<n*.5?this.fast+1:Math.max(0,this.fast-1)),this.slow>30&&this.quality>.75?(this.quality=Math.max(.75,this.quality*.9),this.resize(),this.slow=0,this.fast=0):this.fast>180&&this.quality<1&&(this.quality=Math.min(1,this.quality+.05),this.resize(),this.slow=0,this.fast=0),!0}};var p=null,Y,C=!1,k="",G=0,X=0;function re(i=0){C||!p||(C=!0,Y=setTimeout(le,i))}function le(){if(C=!1,!p)return;let i=performance.now();p.frame(i)&&X++,(p.state.phase!==k||i-G>=1e3)&&(k=p.state.phase,self.postMessage({type:"state",phase:k,x:p.state.x,y:p.state.y,particles:p.particles.lights.length,fps:Math.round(X*1e3/Math.max(1,i-G)),scale:p.renderScale}),G=i,X=0),p.visible&&!p.paused&&!p.reduced&&re(p.tracking?16:8)}self.onmessage=({data:i})=>{try{if(i.type==="init"){let t=i.canvas;p=new L(new z(t),i.width,i.height),t.addEventListener("webglcontextlost",s=>{s.preventDefault(),clearTimeout(Y),p=null,self.postMessage({type:"fallback"})}),p.update(i),p.resize(i.width,i.height,i.dpr),self.postMessage({type:"ready"})}else p&&i.type==="resize"?p.resize(i.width,i.height,i.dpr):p?.update(i);re()}catch{clearTimeout(Y),C=!1,p=null,self.postMessage({type:"fallback"})}};

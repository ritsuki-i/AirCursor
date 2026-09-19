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
`,W=`
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
`,j=`
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
`,V=`
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
`,q=`
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
`;var z=class{constructor(t){this.canvas=t;this.buffers=[];this.shaders=[];this.dpr=1;this.height=1e3;this.pointCapacity=0;this.trailCapacity=0;let s=t.getContext("webgl",{alpha:!1,antialias:!1,depth:!1,powerPreference:"low-power"});if(!s)throw new Error("WebGL unavailable");this.gl=s,this.points=this.createProgram(W,j,["aspect","dpr","height","time","reduced","cloud"],["position","style","pulse"]);let o=s.createTexture();if(!o)throw new Error("Texture unavailable");this.cloud=o;let r=new Uint8Array(64*64);for(let n=0;n<64;n++)for(let a=0;a<64;a++){let e=a/63-.5,l=n/63-.5,h=Math.hypot(e,l),p=Math.max(0,Math.min(1,(.5-h)/.23)),m=.6+.15*Math.sin(e*25+Math.sin(l*19))+.12*Math.cos(l*37+e*16);r[n*64+a]=Math.round(255*Math.exp(-h*h*14)*p*p*(3-2*p)*m)}s.bindTexture(s.TEXTURE_2D,o),s.texImage2D(s.TEXTURE_2D,0,s.LUMINANCE,64,64,0,s.LUMINANCE,s.UNSIGNED_BYTE,r),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),this.trails=this.createProgram(V,q,["aspect"],["position","light"]),this.core=this.createProgram(H,K,["resolution","center","energy","release","flash","reduced"],["position"]);for(let n=0;n<3;n++){let a=s.createBuffer();if(!a)throw new Error("Buffer unavailable");this.buffers.push(a)}s.bindBuffer(s.ARRAY_BUFFER,this.buffers[2]),s.bufferData(s.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),s.STATIC_DRAW),s.enable(s.BLEND),s.blendFunc(s.SRC_ALPHA,s.ONE),s.disable(s.DEPTH_TEST)}createProgram(t,s,o,r){let n=this.gl,a=n.createProgram();if(!a)throw new Error("Program unavailable");for(let[e,l]of[[n.VERTEX_SHADER,t],[n.FRAGMENT_SHADER,s]]){let h=n.createShader(e);if(!h)throw new Error("Shader unavailable");if(n.shaderSource(h,l),n.compileShader(h),!n.getShaderParameter(h,n.COMPILE_STATUS))throw new Error(n.getShaderInfoLog(h)||"Shader compilation failed");this.shaders.push(h),n.attachShader(a,h)}if(n.linkProgram(a),!n.getProgramParameter(a,n.LINK_STATUS))throw new Error(n.getProgramInfoLog(a)||"Program linking failed");return{program:a,uniforms:Object.fromEntries(o.map(e=>[e,n.getUniformLocation(a,`u_${e}`)])),attributes:Object.fromEntries(r.map(e=>[e,n.getAttribLocation(a,`a_${e}`)]))}}resize(t,s,o){this.dpr=o,this.height=s,this.canvas.width=Math.max(1,Math.round(t*o)),this.canvas.height=Math.max(1,Math.round(s*o)),this.gl.viewport(0,0,this.canvas.width,this.canvas.height)}attribute(t,s,o,r){t<0||(this.gl.enableVertexAttribArray(t),this.gl.vertexAttribPointer(t,s,this.gl.FLOAT,!1,o*4,r*4))}disableAttributes(){for(let t=0;t<3;t++)this.gl.disableVertexAttribArray(t)}draw(t,s,o){let r=this.gl,{points:n,vertices:a}=t.pack(s,o);r.clearColor(.004,.009,.024,1),r.clear(r.COLOR_BUFFER_BIT),r.blendFunc(r.SRC_ALPHA,r.ONE),r.useProgram(this.points.program),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,this.cloud),r.uniform1i(this.points.uniforms.cloud,0),r.uniform1f(this.points.uniforms.aspect,t.aspect),r.uniform1f(this.points.uniforms.dpr,this.dpr),r.uniform1f(this.points.uniforms.height,this.height),r.uniform1f(this.points.uniforms.time,o?0:t.time),r.uniform1f(this.points.uniforms.reduced,o?1:0),r.bindBuffer(r.ARRAY_BUFFER,this.buffers[0]),this.pointCapacity!==t.pointData.byteLength&&(this.pointCapacity=t.pointData.byteLength,r.bufferData(r.ARRAY_BUFFER,this.pointCapacity,r.DYNAMIC_DRAW)),r.bufferSubData(r.ARRAY_BUFFER,0,t.pointData),this.attribute(this.points.attributes.position,3,9,0),this.attribute(this.points.attributes.style,4,9,3),this.attribute(this.points.attributes.pulse,2,9,7),r.drawArrays(r.POINTS,0,n),this.disableAttributes(),r.useProgram(this.trails.program),r.uniform1f(this.trails.uniforms.aspect,t.aspect),r.bindBuffer(r.ARRAY_BUFFER,this.buffers[1]),this.trailCapacity!==t.trailData.byteLength&&(this.trailCapacity=t.trailData.byteLength,r.bufferData(r.ARRAY_BUFFER,this.trailCapacity,r.DYNAMIC_DRAW)),r.bufferSubData(r.ARRAY_BUFFER,0,t.trailData.subarray(0,a*6)),this.attribute(this.trails.attributes.position,3,6,0),this.attribute(this.trails.attributes.light,3,6,3),r.drawArrays(r.TRIANGLES,0,a),this.disableAttributes(),r.useProgram(this.core.program),r.blendFunc(r.ONE,r.ONE);let e=o?s.compression*.15:s.phase==="rupture"||s.phase==="afterglow"?t.releasedEnergy*s.glow:t.captureFraction;r.uniform2f(this.core.uniforms.resolution,this.canvas.width,this.canvas.height),r.uniform2f(this.core.uniforms.center,t.centerX,t.centerY),r.uniform1f(this.core.uniforms.energy,e),r.uniform1f(this.core.uniforms.release,s.release),r.uniform1f(this.core.uniforms.flash,o?0:s.glow),r.uniform1f(this.core.uniforms.reduced,o?1:0),r.bindBuffer(r.ARRAY_BUFFER,this.buffers[2]),this.attribute(this.core.attributes.position,2,2,0),r.drawArrays(r.TRIANGLES,0,6),this.disableAttributes()}dispose(){let t=this.gl;this.shaders.forEach(s=>t.deleteShader(s)),this.buffers.forEach(s=>t.deleteBuffer(s)),t.deleteTexture(this.cloud),[this.points,this.trails,this.core].forEach(s=>t.deleteProgram(s.program))}};var $=()=>({x:.69,y:.51,detected:!1,pressed:!1,launch:!1,demo:!1}),Z=()=>({phase:"ambient",elapsed:0,time:0,x:.69,y:.51,influence:0,compression:0,release:0,glow:0,armed:!0}),J=i=>Math.max(0,Math.min(1,i)),U=i=>{let t=J(i);return t*t*(3-2*t)};function _(i,t){i.phase=t,i.elapsed=0}function Q(i,t,s,o){let r=Math.min(Math.max(s,0),.05);i.elapsed+=r;let n=t.launch;if(t.launch=!1,n&&["attraction","compression","silence"].includes(i.phase)&&(i.glow=1,i.release=0,_(i,"rupture")),i.time+=r*(i.phase==="silence"?.18:1+i.compression*1.2),!["rupture","afterglow"].includes(i.phase)){let l=1-Math.exp(-r*5);i.x+=(t.x-i.x)*l,i.y+=(t.y-i.y)*l}!t.pressed&&!t.demo&&(i.armed=!0),i.phase==="ambient"||i.phase==="detection"?(i.compression=0,i.release=0,i.glow=0,(t.pressed||t.demo)&&i.armed?(i.armed=!1,_(i,"attraction")):t.detected&&i.phase==="ambient"?_(i,"detection"):!t.detected&&i.phase==="detection"&&_(i,"ambient")):i.phase==="attraction"?(i.compression=.18*U(i.elapsed/.75),!t.pressed&&!t.demo?_(i,"afterglow"):i.elapsed>=.75&&_(i,"compression")):i.phase==="compression"?(i.compression=.18+.82*U(i.elapsed/1.25),!t.pressed&&!t.demo?_(i,"afterglow"):i.elapsed>=1.25&&(!o||o.captureFraction>=.94||i.elapsed>=2.6)&&(i.compression=1,_(i,"silence"))):i.phase==="silence"?!t.pressed&&!t.demo&&_(i,"afterglow"):i.phase==="rupture"?(i.release=J(i.elapsed/.85),i.compression=1-U(i.release),i.glow=Math.exp(-i.elapsed*5),i.elapsed>=.85&&_(i,"afterglow")):i.phase==="afterglow"&&(i.compression*=Math.exp(-r*4),i.glow*=Math.exp(-r*2),i.release=Math.min(2,i.release+r*.4),i.elapsed>=3.2&&(t.demo=!1,_(i,"ambient")));let e=i.phase==="ambient"?0:i.phase==="detection"?.3:i.phase==="afterglow"?0:1;return i.phase!=="silence"&&(i.influence+=(e-i.influence)*(1-Math.exp(-r*3))),i}var k={stars:1800,dust:10400,glints:1300,fragments:180,streams:300,gas:56},ee={stars:900,dust:4600,glints:680,fragments:90,streams:160,gas:36},te={stars:440,dust:1700,glints:360,fragments:60,streams:90,gas:24},de=1/120,B=Math.PI*2,oe=(i,t,s)=>Math.max(t,Math.min(s,i));function ne(i){return()=>(i^=i<<13,i^=i>>>17,i^=i<<5,(i>>>0)/4294967296)}var S=class{constructor(t=k,s=1.44,o=1701){this.lights=[];this.streams=[];this.time=0;this.capturedCount=0;this.previousPhase="ambient";this.centerX=0;this.centerY=0;this.historyTime=0;this.flow=new Float64Array(3);this.captureAtRelease=0;this.aspect=s;let r=ne(o),n=(a,e)=>{for(let l=0;l<e;l++){let h=this.lights.length,p=r()*B,m=Math.floor(r()*3),M=r()+r()+r()-1.5,y=.39+m*.21+M*.15,b=.21*s+Math.cos(p)*y+.07*Math.sin(p*2+m),v=-.015+Math.sin(p)*y*.62+.14*Math.sin(p*2+m*.5),E=(r()-.5)*.65+Math.cos(p+m)*.12,c=r()*B,g=r()*B,w=(r()-.5)*1.2,u={id:h,kind:a,x:a==="star"?(r()-.5)*s*1.35:b,y:a==="star"?(r()-.5)*1.35:v,z:a==="star"?.4+r()*1.2:E,vx:0,vy:0,vz:0,hx:b,hy:v,hz:E,response:.72+r()*.95,drag:.7+r()*1.9,swirl:r()<.22?.03:.25+r()*.95,size:a==="gas"?240+r()*280:a==="fragment"?4+r()*5:a==="glint"?4+r()*6:1.2+r()*2.5,brightness:a==="gas"?.24+r()*.2:a==="dust"?.42+r()*.75:.65+r()*.9,hue:r(),phase:c,pulseRate:.3+r()*1.1,launchSpeed:.22+Math.pow(r(),1.2)*1.7,launchDelay:r()*.12,lifetime:.75+r()*3.5,launchX:Math.cos(g),launchY:Math.sin(g),launchZ:w,captured:!1,releaseAge:-1,released:!1,alpha:1};if(this.ambientVelocity(u.x,u.y,u.z,c,this.flow),u.vx=this.flow[0]*u.response,u.vy=this.flow[1]*u.response,u.vz=this.flow[2],this.lights.push(u),a==="stream"){let A=54+Math.floor(r()*35),P=new Float32Array(A*3),x=u.x,F=u.y,R=u.z;for(let T=0;T<A;T++){let D=(A-1-T)*3;P[D]=x,P[D+1]=F,P[D+2]=R,this.ambientVelocity(x,F,R,c,this.flow),x-=this.flow[0]*.075*u.response,F-=this.flow[1]*.075*u.response,R-=this.flow[2]*.075}this.streams.push({light:u,history:P,length:A,head:A-1})}}};n("gas",t.gas),n("star",t.stars),n("dust",t.dust),n("glint",t.glints),n("fragment",t.fragments),n("stream",t.streams),this.gasCount=t.gas,this.reactiveCount=this.lights.filter(a=>a.kind!=="star"&&a.kind!=="gas").length,this.pointData=new Float32Array(this.lights.length*9),this.trailData=new Float32Array(this.streams.reduce((a,e)=>a+(e.length-1)*6*6,0))}get captureFraction(){return this.capturedCount/Math.max(1,this.reactiveCount)}ambientVelocity(t,s,o,r,n){let a=t-this.aspect*.21,e=s+.015,l=Math.sqrt(a*a+e*e*2.5+.018),h=t*3.1+o*1.7+this.time*.045,p=s*4.3-o*.9-this.time*.038;n[0]=-e*.072/(l+.2)+Math.sin(h)*Math.sin(p)*.013,n[1]=a*.032/(l+.2)+Math.cos(h)*Math.cos(p)*.009,n[2]=Math.sin(t*2.4+s*3.1+r+this.time*.13)*.007}step(t,s){let o=Math.min(s,.03333333333333333);if(this.centerX=(t.x-.5)*this.aspect,this.centerY=.5-t.y,t.phase==="silence"){this.time+=o*.18;let e=0;for(let l of this.lights)l.kind==="star"?(l.x+=Math.sin(l.phase+this.time*.09)*8e-5*o,l.y+=Math.cos(l.phase+this.time*.07)*6e-5*o):l.captured&&(l.x=this.centerX+l.launchX*.002,l.y=this.centerY+l.launchY*.002,l.z=l.launchZ*.002,l.alpha=l.kind==="gas"?.02:.15,l.kind!=="gas"&&e++);this.capturedCount=e,this.previousPhase=t.phase;return}if(this.time+=o,t.phase==="rupture"&&this.previousPhase!=="rupture"){this.captureAtRelease=this.captureFraction;for(let e of this.lights)e.kind!=="star"&&(e.releaseAge=-e.launchDelay,e.released=!1)}let r=t.phase==="attraction"||t.phase==="compression",n=t.phase==="rupture"||t.phase==="afterglow",a=0;for(let e of this.lights){if(e.kind==="star"){e.x+=Math.sin(e.phase+this.time*.09)*25e-5*o,e.y+=Math.cos(e.phase+this.time*.07)*18e-5*o;continue}let l=this.centerX-e.x,h=this.centerY-e.y,p=-e.z,m=l*l+h*h+p*p*.4,M=Math.sqrt(m+1e-6);if(e.captured&&r){e.x=this.centerX+e.launchX*.002,e.y=this.centerY+e.launchY*.002,e.z=e.launchZ*.002,e.alpha=e.kind==="gas"?.02:.15,e.kind!=="gas"&&a++;continue}if(n&&e.releaseAge>-1){if(e.releaseAge+=o,e.releaseAge>=0&&!e.released){let c=e.captured?1:1/(1+M*3);e.vx=e.launchX*e.launchSpeed*c+e.vx*.12,e.vy=e.launchY*e.launchSpeed*c+e.vy*.12,e.vz=e.launchZ*e.launchSpeed*c,e.captured=!1,e.released=!0}if(e.captured){e.kind!=="gas"&&a++;continue}}else r||(e.captured=!1);this.ambientVelocity(e.x,e.y,e.z,e.phase,this.flow);let y=(this.flow[0]*e.response-e.vx)*.7,b=(this.flow[1]*e.response-e.vy)*.7,v=(this.flow[2]-e.vz)*.7;if(r){let g=(.3+t.compression*t.compression*4.5)*e.response/(.085+m),w=Math.sqrt(g)*(1.35+e.drag*.13),u=e.swirl*(1-t.compression*.85)*g*.3;if(y=l*g-h*u-e.vx*w,b=h*g+l*u-e.vy*w,v=p*g-e.vz*w,M<.012+t.compression*.01&&t.compression>.2){e.captured=!0,e.alpha=.15,e.kind!=="gas"&&a++;continue}}else if(t.phase==="detection"){let c=Math.exp(-m/.065)*.26*e.response;y+=l*c-h*c*e.swirl,b+=h*c+l*c*e.swirl,v+=p*c}if(n&&e.released){let c=t.phase==="afterglow"?oe((t.elapsed-.2)/2,0,1):0,g=e.drag*.55+c*2;y=-e.vx*g+(e.hx-e.x)*c*(1.5+e.response),b=-e.vy*g+(e.hy-e.y)*c*(1.5+e.response),v=-e.vz*g+(e.hz-e.z)*c*2,y-=e.vy*e.swirl*.65,b+=e.vx*e.swirl*.65;let w=Math.exp(-Math.max(0,e.releaseAge)/e.lifetime);e.alpha=w*(e.kind==="fragment"?1.8:1.25)+c*.7}else r||(y+=(e.hx+Math.sin(this.time*.07+e.phase)*.1-e.x)*.018,b+=(e.hy+Math.cos(this.time*.09+e.phase)*.055-e.y)*.018,v+=(e.hz-e.z)*.05),e.alpha+=(1-e.alpha)*Math.min(1,o*3),e.releaseAge>=0&&(e.releaseAge=-1,e.released=!1);e.vx+=y*o,e.vy+=b*o,e.vz+=v*o;let E=Math.sqrt(e.vx*e.vx+e.vy*e.vy+e.vz*e.vz);if(E>4.5){let c=4.5/E;e.vx*=c,e.vy*=c,e.vz*=c}e.x+=e.vx*o,e.y+=e.vy*o,e.z+=e.vz*o}if(this.capturedCount=a,this.historyTime+=o,this.historyTime>=.045){this.historyTime%=.045;for(let e of this.streams){if(e.light.captured)for(let h=0;h<e.length;h++)e.history[h*3]=e.light.x,e.history[h*3+1]=e.light.y,e.history[h*3+2]=e.light.z;e.head=(e.head+1)%e.length;let l=e.head*3;e.history[l]=e.light.x,e.history[l+1]=e.light.y,e.history[l+2]=e.light.z}}this.previousPhase=t.phase}pack(t,s){let o=0,r=t.phase==="silence";for(let a of this.lights){let e=a.kind==="gas"?3:a.kind==="fragment"?2:a.kind==="glint"?1:0,l=a.alpha*a.brightness*(r&&a.kind==="star"?.08:1),h=this.pointData;h[o++]=a.x,h[o++]=a.y,h[o++]=a.z,h[o++]=a.size,h[o++]=l,h[o++]=a.hue,h[o++]=e,h[o++]=a.phase,h[o++]=a.pulseRate}let n=0;for(let a of this.streams){let e=a.light,l=e.brightness*e.alpha*(e.captured?.006:1)*(r?.02:1)*(s?.5:1),h=e.released?Math.min(a.length,4+Math.floor(e.lifetime*3)):a.length,p=e.released?1:3;for(let m=0;m<h-1;m+=p){let M=Math.min(m+p,h-1),y=(a.head-m+a.length)%a.length*3,b=(a.head-M+a.length)%a.length*3,v=Math.max(.55,1+a.history[y+2]*.32),E=Math.max(.55,1+a.history[b+2]*.32),c=a.history[b]/E-a.history[y]/v,g=a.history[b+1]/E-a.history[y+1]/v,w=Math.hypot(c,g)+1e-6,u=65e-5+e.hue*55e-5,A=-g/w*u,P=c/w*u;for(let x=0;x<6;x++){let F=x===2||x===4||x===5?1:0,R=x===0||x===3||x===5?-1:1,T=F?b:y,D=F?E:v,ie=Math.pow(1-(F?M:m)/(h-1),1.6);this.trailData[n++]=a.history[T]+A*R*D,this.trailData[n++]=a.history[T+1]+P*R*D,this.trailData[n++]=a.history[T+2],this.trailData[n++]=l*ie*.78,this.trailData[n++]=e.hue,this.trailData[n++]=R}}}return{points:this.lights.length,vertices:n/6}}get releasedEnergy(){return this.captureAtRelease}};var L=class{constructor(t,s,o,r=!1){this.renderer=t;this.fallback=r;d(this,"state",Z());d(this,"input",$());d(this,"particles");d(this,"paused",!1);d(this,"reduced",!1);d(this,"tracking",!1);d(this,"visible",!0);d(this,"dirty",!0);d(this,"previous",0);d(this,"accumulator",0);d(this,"width",1);d(this,"height",1);d(this,"dpr",1);d(this,"quality",1);d(this,"slow",0);d(this,"pressure",0);this.particles=new S(r?te:s<650?ee:k,s/o)}resize(t=this.width,s=this.height,o=this.dpr){this.width=Math.max(1,t),this.height=Math.max(1,s),this.dpr=o,this.particles.aspect=this.width/this.height;let r=(this.tracking?7e5:11e5)/(1+this.pressure*.65);this.renderer.resize(this.width,this.height,this.quality*Math.min(o,1.25,Math.sqrt(r/(this.width*this.height)))),this.dirty=!0}update(t){if(t.input){let{demo:s,launch:o,...r}=t.input;Object.assign(this.input,r)}t.visible!==void 0&&t.visible!==this.visible&&(this.visible=t.visible,this.previous=0),t.paused!==void 0&&(this.paused=t.paused),t.reduced!==void 0&&this.reduced!==t.reduced&&(this.reduced=t.reduced,this.dirty=!0),t.tracking!==void 0&&this.tracking!==t.tracking&&(this.tracking=t.tracking,this.resize()),t.pressure!==void 0&&t.pressure!==this.pressure&&(this.pressure=t.pressure,this.resize()),t.play&&(["attraction","compression","silence"].includes(this.state.phase)?this.input.launch=!0:["ambient","detection"].includes(this.state.phase)&&(this.input.demo=!0,this.state.armed=!0)),t.release&&(this.input.pressed=!1,this.input.launch=!0)}frame(t){if(!this.visible||(this.paused||this.reduced)&&!this.dirty)return this.previous=0,!1;let s=this.fallback?24:this.tracking?30:60,o=1e3/Math.max(20,s-this.pressure*12);if(!this.dirty&&t-this.previous<o-1)return!1;let r=this.previous?Math.min((t-this.previous)/1e3,.05):1/60;this.previous=t;let n=performance.now();if(!this.paused&&!this.reduced)for(this.accumulator=Math.min(this.accumulator+r,1/30);this.accumulator>=1/60;)Q(this.state,this.input,1/60,this.particles),this.particles.step(this.state,1/60),this.accumulator-=1/60;this.renderer.draw(this.particles,this.state,this.reduced),this.dirty=!1;let a=performance.now()-n;return this.slow=a>o*.8?this.slow+1:Math.max(0,this.slow-1),this.slow>15&&this.quality>.6&&(this.quality*=.85,this.resize(),this.slow=0),!0}};var f=null,Y,C=!1,I="",G=0,X=0;function re(i=0){C||!f||(C=!0,Y=setTimeout(le,i))}function le(){if(C=!1,!f)return;let i=performance.now();f.frame(i)&&X++,(f.state.phase!==I||i-G>=1e3)&&(I=f.state.phase,self.postMessage({type:"state",phase:I,x:f.state.x,y:f.state.y,particles:f.particles.lights.length,fps:Math.round(X*1e3/Math.max(1,i-G))}),G=i,X=0),f.visible&&!f.paused&&!f.reduced&&re(f.tracking?16:8)}self.onmessage=({data:i})=>{try{if(i.type==="init"){let t=i.canvas;f=new L(new z(t),i.width,i.height),t.addEventListener("webglcontextlost",s=>{s.preventDefault(),clearTimeout(Y),f=null,self.postMessage({type:"fallback"})}),f.update(i),f.resize(i.width,i.height,i.dpr),self.postMessage({type:"ready"})}else f&&i.type==="resize"?f.resize(i.width,i.height,i.dpr):f?.update(i);re()}catch{clearTimeout(Y),C=!1,f=null,self.postMessage({type:"fallback"})}};

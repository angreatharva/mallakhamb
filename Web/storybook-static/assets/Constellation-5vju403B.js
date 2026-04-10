import{r as p,j as r,D as x,P as a}from"./iframe-B6P-JI9O.js";import{u as h}from"./useReducedMotion-B8214p5W.js";import"./preload-helper-PPVm8Dsz.js";const u=({color:o=x.colors.brand.saffron,opacity:m=.3,starCount:i=50,connectionDistance:l=150,className:f=""})=>{h();const n=p.useMemo(()=>{const e=[];for(let t=0;t<i;t++)e.push({x:Math.random()*100,y:Math.random()*100,size:Math.random()*2+1});return e},[i]),y=p.useMemo(()=>{const e=[];for(let t=0;t<n.length;t++)for(let s=t+1;s<n.length;s++){const c=n[s].x-n[t].x,d=n[s].y-n[t].y;Math.sqrt(c*c+d*d)<l/10&&e.push({x1:n[t].x,y1:n[t].y,x2:n[s].x,y2:n[s].y})}return e},[n,l]);return r.jsx("div",{className:`absolute inset-0 pointer-events-none overflow-hidden ${f}`,style:{zIndex:0},"aria-hidden":"true",children:r.jsxs("svg",{width:"100%",height:"100%",xmlns:"http://www.w3.org/2000/svg",style:{opacity:m},children:[y.map((e,t)=>r.jsx("line",{x1:`${e.x1}%`,y1:`${e.y1}%`,x2:`${e.x2}%`,y2:`${e.y2}%`,stroke:o,strokeWidth:"0.5",strokeOpacity:"0.3"},`connection-${t}`)),n.map((e,t)=>r.jsx("circle",{cx:`${e.x}%`,cy:`${e.y}%`,r:e.size,fill:o},`star-${t}`))]})})};u.propTypes={color:a.string,opacity:a.number,starCount:a.number,connectionDistance:a.number,className:a.string};u.__docgenInfo={description:`Constellation - Star field with connected dots background decoration

Renders a star field with lines connecting nearby stars, creating a constellation effect.
Respects user motion preferences. Positioned absolutely and designed to not interfere with content readability.

@param {Object} props
@param {string} props.color - Hex color for stars and connections (default: saffron)
@param {number} props.opacity - Opacity value 0-1 (default: 0.3)
@param {number} props.starCount - Number of stars to render (default: 50)
@param {number} props.connectionDistance - Maximum distance for connecting stars (default: 150)
@param {string} props.className - Additional CSS classes

@example
<Constellation color="#8B5CF6" starCount={60} opacity={0.4} />`,methods:[],displayName:"Constellation",props:{color:{defaultValue:{value:"'#FF6B00'",computed:!1},description:"",type:{name:"string"},required:!1},opacity:{defaultValue:{value:"0.3",computed:!1},description:"",type:{name:"number"},required:!1},starCount:{defaultValue:{value:"50",computed:!1},description:"",type:{name:"number"},required:!1},connectionDistance:{defaultValue:{value:"150",computed:!1},description:"",type:{name:"number"},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1}}};export{u as default};

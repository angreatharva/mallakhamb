import{j as d,D as m,P as e}from"./iframe-B6P-JI9O.js";import{u as f}from"./useReducedMotion-B8214p5W.js";import"./preload-helper-PPVm8Dsz.js";const r=({color:s=m.colors.brand.saffron,opacity:i=.15,position:l="top-right",size:p="md",className:n=""})=>{f();const t={sm:"400px",md:"600px",lg:"800px"},o={"top-left":{top:"-10%",left:"-10%"},"top-right":{top:"-10%",right:"-10%"},"bottom-left":{bottom:"-10%",left:"-10%"},"bottom-right":{bottom:"-10%",right:"-10%"},center:{top:"50%",left:"50%",transform:"translate(-50%, -50%)"}},a=t[p]||t.md,u=o[l]||o["top-right"];return d.jsx("div",{className:`absolute pointer-events-none ${n}`,style:{...u,width:a,height:a,background:`radial-gradient(circle, ${s} 0%, transparent 70%)`,opacity:i,zIndex:0,filter:"blur(60px)"},"aria-hidden":"true"})};r.propTypes={color:e.string,opacity:e.number,position:e.oneOf(["top-left","top-right","bottom-left","bottom-right","center"]),size:e.oneOf(["sm","md","lg"]),className:e.string};r.__docgenInfo={description:`RadialBurst - Radial gradient background decoration

Renders a radial gradient burst effect that respects user motion preferences.
Positioned absolutely and designed to not interfere with content readability.

@param {Object} props
@param {string} props.color - Hex color for the burst (default: saffron)
@param {number} props.opacity - Opacity value 0-1 (default: 0.15)
@param {string} props.position - Position of burst: 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center' (default: 'top-right')
@param {string} props.size - Size of burst: 'sm', 'md', 'lg' (default: 'md')
@param {string} props.className - Additional CSS classes

@example
<RadialBurst color="#8B5CF6" position="top-left" size="lg" opacity={0.2} />`,methods:[],displayName:"RadialBurst",props:{color:{defaultValue:{value:"'#FF6B00'",computed:!1},description:"",type:{name:"string"},required:!1},opacity:{defaultValue:{value:"0.15",computed:!1},description:"",type:{name:"number"},required:!1},position:{defaultValue:{value:"'top-right'",computed:!1},description:"",type:{name:"enum",value:[{value:"'top-left'",computed:!1},{value:"'top-right'",computed:!1},{value:"'bottom-left'",computed:!1},{value:"'bottom-right'",computed:!1},{value:"'center'",computed:!1}]},required:!1},size:{defaultValue:{value:"'md'",computed:!1},description:"",type:{name:"enum",value:[{value:"'sm'",computed:!1},{value:"'md'",computed:!1},{value:"'lg'",computed:!1}]},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1}}};export{r as default};

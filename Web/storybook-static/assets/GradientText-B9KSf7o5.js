import{j as s,D as r}from"./iframe-B6P-JI9O.js";import{u as p}from"./useReducedMotion-B8214p5W.js";import{u as m}from"./useTheme-2R4gOSi3.js";import{m as c}from"./proxy-Dci2HvBq.js";import"./preload-helper-PPVm8Dsz.js";const u=({children:n,className:o="",colors:a,animate:l=!1})=>{const d=p(),e=m();let t;a&&Array.isArray(a)&&a.length>=2?t=a:e?.colors?.primary?t=[e.colors.primary,e.colors.primaryLight||e.colors.primary,e.colors.primary]:t=[r.colors.brand.saffron,r.colors.brand.gold,r.colors.brand.saffronLight];const i={background:`linear-gradient(135deg, ${t.join(", ")})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"};return l&&!d?s.jsx(c.span,{className:o,style:{...i,backgroundSize:"200% 200%"},animate:{backgroundPosition:["0% 50%","100% 50%","0% 50%"]},transition:{duration:4,repeat:1/0,ease:"linear"},children:n}):s.jsx("span",{className:o,style:i,children:n})};u.__docgenInfo={description:`GradientText - Animated gradient text component

Displays text with a gradient color effect and optional animation.
Respects prefers-reduced-motion setting.

@param {Object} props
@param {React.ReactNode} props.children - Text content to display
@param {string} props.className - Additional CSS classes
@param {Array<string>} props.colors - Array of gradient colors (default: uses theme colors)
@param {boolean} props.animate - Enable gradient animation (default: false)

@example
<GradientText>Hello World</GradientText>
<GradientText colors={['#FF6B00', '#F5A623', '#FF8C38']} animate>
  Animated Text
</GradientText>`,methods:[],displayName:"GradientText",props:{className:{defaultValue:{value:"''",computed:!1},required:!1},animate:{defaultValue:{value:"false",computed:!1},required:!1}}};export{u as default};

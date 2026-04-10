import{R as a,C as o,j as t,P as e}from"./iframe-B6P-JI9O.js";import{F as R}from"./FadeIn-BSItv_x8.js";import{u as k}from"./useResponsive-DRC15Gv5.js";import{c as V}from"./createLucideIcon-D8jzYoXh.js";import"./preload-helper-PPVm8Dsz.js";import"./useReducedMotion-B8214p5W.js";const F=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744",key:"16gr8j"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],O=V("users",F),i=({icon:l,label:b,value:v,color:s,delay:S=0,subtitle:n,className:h="",style:p={},padding:d,fontSize:m})=>{const{getResponsiveValue:u}=k(),x=d?u(d):"md",c={sm:"1rem",md:"1.5rem",lg:"2rem"},g=c[x]||c.md,C=m?u(m):"2xl",y={xl:"1.5rem","2xl":"2rem","3xl":"2.5rem"},f=y[C]||y["2xl"],q=a.useMemo(()=>({...o.cardBase,padding:g,...p}),[g,p]),z=a.useMemo(()=>({color:s,width:"2.5rem",height:"2.5rem",marginBottom:"0.75rem"}),[s]),j=a.useMemo(()=>({...o.textSecondary,fontSize:"0.875rem",fontWeight:500,marginBottom:"0.5rem"}),[]),M=a.useMemo(()=>({color:s,fontSize:f,fontWeight:700,lineHeight:1.2,marginBottom:n?"0.25rem":0}),[s,f,n]),T=a.useMemo(()=>({...o.textMuted,fontSize:"0.75rem",fontWeight:400}),[]);return t.jsx(R,{delay:S,direction:"up",children:t.jsxs("div",{className:`stat-card ${h}`,style:q,children:[l&&t.jsx(l,{style:z,"aria-hidden":"true"}),t.jsx("div",{style:j,children:b}),t.jsx("div",{style:M,children:v}),n&&t.jsx("div",{style:T,children:n})]})})};i.propTypes={icon:e.elementType,label:e.string.isRequired,value:e.oneOfType([e.number,e.string]).isRequired,color:e.string.isRequired,delay:e.number,subtitle:e.string,className:e.string,style:e.object,padding:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})]),fontSize:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})])};i.defaultProps={icon:null,delay:0,subtitle:null,className:"",style:{},padding:null,fontSize:null};const B=a.memo(i);i.__docgenInfo={description:`StatCard - A card component for displaying statistics

Features:
- Icon, label, value, and optional subtitle display
- Consistent styling with other cards
- Fade-in animation with configurable delay
- Color customization
- Memoized for performance optimization
- Optimized with shared style objects

@param {Object} props
@param {React.ComponentType} props.icon - Icon component to display
@param {string} props.label - Stat label text
@param {number|string} props.value - Stat value to display
@param {string} props.color - Color for icon and value
@param {number} props.delay - Animation delay in milliseconds
@param {string} props.subtitle - Optional subtitle text
@param {string} props.className - Additional CSS classes
@param {React.CSSProperties} props.style - Additional inline styles
@param {object|string} [props.padding] - Responsive padding values
@param {object|string} [props.fontSize] - Responsive font size for value

@example
<StatCard
  icon={Users}
  label="Total Users"
  value={1234}
  color="#8B5CF6"
  delay={100}
  subtitle="Active this month"
/>

@example
<StatCard
  icon={Users}
  label="Total Users"
  value={1234}
  color="#8B5CF6"
  padding={{ mobile: 'sm', desktop: 'lg' }}
  fontSize={{ mobile: 'xl', desktop: '2xl' }}
/>

**Validates: Requirements 4.3, 4.5, 4.7, 10.3, 10.5, 15.1, 15.5**`,methods:[],displayName:"StatCardComponent",props:{delay:{defaultValue:{value:"0",computed:!1},description:"",type:{name:"number"},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},style:{defaultValue:{value:"{}",computed:!1},description:"",type:{name:"object"},required:!1},icon:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"elementType"},required:!1},subtitle:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"string"},required:!1},padding:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1},fontSize:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1},label:{description:"",type:{name:"string"},required:!0},value:{description:"",type:{name:"union",value:[{name:"number"},{name:"string"}]},required:!0},color:{description:"",type:{name:"string"},required:!0}}};const I={title:"Design System/Cards/StatCard",component:B,argTypes:{icon:{control:!1},label:{control:{type:"text"}},value:{control:{type:"text"}},subtitle:{control:{type:"text"}},color:{control:{type:"color"}},delay:{control:{type:"number",min:0,max:1e3,step:50}},padding:{control:!1},fontSize:{control:!1}}},r={args:{icon:O,label:"Total participants",value:"1,234",subtitle:"Active this month",color:"#8B5CF6",delay:0}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    icon: Users,
    label: 'Total participants',
    value: '1,234',
    subtitle: 'Active this month',
    color: '#8B5CF6',
    delay: 0
  }
}`,...r.parameters?.docs?.source}}};const D=["Default"];export{r as Default,D as __namedExportsOrder,I as default};

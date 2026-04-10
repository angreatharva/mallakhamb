import{c as E}from"./createLucideIcon-D8jzYoXh.js";import{r as o,j as t,P as e}from"./iframe-B6P-JI9O.js";import{c as R}from"./clsx-B-dksMZM.js";import{u as V}from"./useTheme-2R4gOSi3.js";import{u as k}from"./useResponsive-DRC15Gv5.js";import{m as b}from"./proxy-Dci2HvBq.js";const M=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]],A=E("mail",M),r=o.forwardRef(({icon:l,error:n,rightElement:i,className:y,disabled:p,readOnly:d,padding:m,fontSize:u,...x},v)=>{const c=V(),{getResponsiveValue:s}=k(),a=!!n,f=typeof n=="string"?n:"",w=o.useMemo(()=>m?s(m):"md",[m,s]),g={sm:"px-3 py-2",md:"px-4 py-3",lg:"px-5 py-4"},q=g[w]||g.md,T=o.useMemo(()=>u?s(u):"base",[u,s]),h={sm:"text-sm",base:"text-base",lg:"text-lg"},N=h[T]||h.base,j=o.useMemo(()=>({boxShadow:a?"0 0 0 3px rgba(239, 68, 68, 0.15)":`0 0 0 3px ${c.colors.primaryLight}`}),[a,c.colors.primaryLight]);return t.jsxs("div",{className:"w-full",children:[t.jsxs("div",{className:"relative",children:[l&&t.jsx("div",{className:"absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none","aria-hidden":"true",children:t.jsx(l,{className:"w-5 h-5",style:{color:a?"#EF4444":"rgba(255, 255, 255, 0.45)"}})}),t.jsx(b.input,{ref:v,disabled:p,readOnly:d,className:R("w-full rounded-lg","bg-white/5 backdrop-blur-sm","text-white placeholder:text-white/45","border transition-all duration-200","outline-none",q,N,"min-h-[44px]",l&&"pl-11",i&&"pr-11",!a&&!p&&!d&&["border-white/10","hover:border-white/20","focus:border-current"],a&&["border-red-500/50","focus:border-red-500"],p&&["opacity-50","cursor-not-allowed","border-white/5"],d&&["cursor-default","border-white/5"],y),style:{color:c.colors.primary},whileFocus:j,...x}),i&&t.jsx("div",{className:"absolute right-3 top-1/2 -translate-y-1/2",children:i})]}),f&&t.jsx(b.p,{initial:{opacity:0,y:-4},animate:{opacity:1,y:0},className:"mt-1.5 text-sm text-red-400",role:"alert","aria-live":"polite",children:f})]})});r.displayName="ThemedInput";r.propTypes={icon:e.elementType,error:e.oneOfType([e.bool,e.string]),rightElement:e.node,className:e.string,disabled:e.bool,readOnly:e.bool,padding:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})]),fontSize:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})])};r.defaultProps={icon:null,error:!1,rightElement:null,className:"",disabled:!1,readOnly:!1,padding:null,fontSize:null};r.__docgenInfo={description:`ThemedInput - A themed input component that adapts to the current role context

Features:
- Auto-themed based on current role context
- Icon support (left side)
- Right element slot for password toggle, etc.
- Error state styling with accessible color contrast
- Focus indicators with 3:1 contrast ratio
- Minimum 44px touch target height
- Disabled and readonly states

@param {Object} props
@param {React.ComponentType} [props.icon] - Icon component to display on the left
@param {boolean|string} [props.error] - Error state or error message
@param {React.ReactNode} [props.rightElement] - Element to display on the right (e.g., password toggle)
@param {string} [props.className] - Additional CSS classes
@param {boolean} [props.disabled] - Disabled state
@param {boolean} [props.readOnly] - Readonly state
@param {object|string} [props.padding] - Responsive padding values (e.g., { mobile: 'sm', desktop: 'lg' } or 'md')
@param {object|string} [props.fontSize] - Responsive font size values

@example
<ThemedInput
  icon={Mail}
  type="email"
  placeholder="Enter email"
  error={errors.email}
/>

@example
<ThemedInput
  type="password"
  placeholder="Enter password"
  rightElement={<button onClick={toggleVisibility}>👁️</button>}
  padding={{ mobile: 'sm', desktop: 'md' }}
/>

**Validates: Requirements 3.1, 3.5, 3.6, 3.7, 3.8, 3.9, 15.1, 15.5**`,methods:[],displayName:"ThemedInput",props:{icon:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"elementType"},required:!1},error:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"union",value:[{name:"bool"},{name:"string"}]},required:!1},rightElement:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"node"},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},disabled:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},readOnly:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},padding:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1},fontSize:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1}}};export{A as M,r as T};

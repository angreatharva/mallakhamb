import{r as f,j as n,P as e}from"./iframe-B6P-JI9O.js";import{c as b}from"./clsx-B-dksMZM.js";import{u as h}from"./useTheme-2R4gOSi3.js";import{m as p}from"./proxy-Dci2HvBq.js";const r=f.forwardRef(({error:a,className:d,disabled:o,readOnly:s,rows:m=4,...u},c)=>{const l=h(),t=!!a,i=typeof a=="string"?a:"";return n.jsxs("div",{className:"w-full",children:[n.jsx(p.textarea,{ref:c,disabled:o,readOnly:s,rows:m,className:b("w-full px-4 py-3 rounded-lg","bg-white/5 backdrop-blur-sm","text-white placeholder:text-white/45","border transition-all duration-200","outline-none resize-y",!t&&!o&&!s&&["border-white/10","hover:border-white/20","focus:border-current"],t&&["border-red-500/50","focus:border-red-500"],o&&["opacity-50","cursor-not-allowed","border-white/5","resize-none"],s&&["cursor-default","border-white/5","resize-none"],d),style:{color:l.colors.primary},whileFocus:{boxShadow:t?"0 0 0 3px rgba(239, 68, 68, 0.15)":`0 0 0 3px ${l.colors.primaryLight}`},...u}),i&&n.jsx(p.p,{initial:{opacity:0,y:-4},animate:{opacity:1,y:0},className:"mt-1.5 text-sm text-red-400",role:"alert","aria-live":"polite",children:i})]})});r.displayName="ThemedTextarea";r.propTypes={error:e.oneOfType([e.bool,e.string]),className:e.string,disabled:e.bool,readOnly:e.bool,rows:e.number};r.defaultProps={error:!1,className:"",disabled:!1,readOnly:!1,rows:4};r.__docgenInfo={description:`ThemedTextarea - A themed textarea component that adapts to the current role context

Features:
- Consistent theming with ThemedInput
- Disabled and readonly states
- Auto-resizing support
- Error state styling

@param {Object} props
@param {boolean|string} [props.error] - Error state or error message
@param {string} [props.className] - Additional CSS classes
@param {boolean} [props.disabled] - Disabled state
@param {boolean} [props.readOnly] - Readonly state
@param {number} [props.rows] - Number of visible text rows

@example
<ThemedTextarea
  placeholder="Enter description"
  rows={4}
  error={errors.description}
/>

**Validates: Requirements 3.3, 3.9**`,methods:[],displayName:"ThemedTextarea",props:{rows:{defaultValue:{value:"4",computed:!1},description:"",type:{name:"number"},required:!1},error:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"union",value:[{name:"bool"},{name:"string"}]},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},disabled:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},readOnly:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1}}};export{r as T};

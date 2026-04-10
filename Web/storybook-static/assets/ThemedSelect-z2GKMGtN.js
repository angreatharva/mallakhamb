import{r as m,j as a,P as e}from"./iframe-B6P-JI9O.js";import{c as h}from"./clsx-B-dksMZM.js";import{u as f}from"./useTheme-2R4gOSi3.js";import{m as b}from"./proxy-Dci2HvBq.js";import{c as y}from"./createLucideIcon-D8jzYoXh.js";const v=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],g=y("chevron-down",v),l=m.forwardRef(({options:s,placeholder:n,className:d,disabled:r,readOnly:t,children:p,...u},c)=>{const i=f();return a.jsxs("div",{className:"relative w-full",children:[a.jsxs(b.select,{ref:c,disabled:r||t,className:h("w-full px-4 py-3 pr-10 rounded-lg","bg-white/5 backdrop-blur-sm","text-white","border transition-all duration-200","outline-none appearance-none","cursor-pointer","min-h-[44px]",!r&&!t&&["border-white/10","hover:border-white/20","focus:border-current"],r&&["opacity-50","cursor-not-allowed","border-white/5"],t&&["cursor-default","border-white/5"],d),style:{color:i.colors.primary},whileFocus:{boxShadow:`0 0 0 3px ${i.colors.primaryLight}`},...u,children:[n&&a.jsx("option",{value:"",disabled:!0,children:n}),s&&s.map(o=>a.jsx("option",{value:o.value,className:"bg-gray-900 text-white",children:o.label},o.value)),p]}),a.jsx("div",{className:"absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none","aria-hidden":"true",children:a.jsx(g,{className:"w-5 h-5",style:{color:r?"rgba(255, 255, 255, 0.30)":"rgba(255, 255, 255, 0.45)"}})})]})});l.displayName="ThemedSelect";l.propTypes={options:e.arrayOf(e.shape({value:e.string.isRequired,label:e.string.isRequired})),placeholder:e.string,className:e.string,disabled:e.bool,readOnly:e.bool,children:e.node};l.defaultProps={options:null,placeholder:"",className:"",disabled:!1,readOnly:!1,children:null};l.__docgenInfo={description:`ThemedSelect - A themed select component that adapts to the current role context

Features:
- Consistent theming with ThemedInput
- Disabled and readonly states
- Minimum 44px touch target height
- Custom chevron icon

@param {Object} props
@param {Array<{value: string, label: string}>} [props.options] - Select options
@param {string} [props.placeholder] - Placeholder text
@param {string} [props.className] - Additional CSS classes
@param {boolean} [props.disabled] - Disabled state
@param {boolean} [props.readOnly] - Readonly state

@example
<ThemedSelect
  options={[
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' }
  ]}
  placeholder="Select an option"
/>

**Validates: Requirements 3.2, 3.8, 3.9**`,methods:[],displayName:"ThemedSelect",props:{options:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"arrayOf",value:{name:"shape",value:{value:{name:"string",required:!0},label:{name:"string",required:!0}}}},required:!1},placeholder:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},disabled:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},readOnly:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},children:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"node"},required:!1}}};export{l as T};

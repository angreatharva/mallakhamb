import{r as d,j as e}from"./iframe-B6P-JI9O.js";import{T as a,M as i}from"./ThemedInput-CCDiYLBx.js";import{c as n}from"./createLucideIcon-D8jzYoXh.js";import"./preload-helper-PPVm8Dsz.js";import"./clsx-B-dksMZM.js";import"./useTheme-2R4gOSi3.js";import"./useResponsive-DRC15Gv5.js";import"./proxy-Dci2HvBq.js";const m=[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]],h=n("eye-off",m);const y=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],u=n("eye",y),S={title:"Design System/Forms/ThemedInput",component:a,argTypes:{type:{control:{type:"text"}},placeholder:{control:{type:"text"}},disabled:{control:"boolean"},readOnly:{control:"boolean"},error:{control:{type:"text"}},icon:{control:!1},rightElement:{control:!1},padding:{control:!1},fontSize:{control:!1}}},r={args:{icon:i,type:"email",placeholder:"Enter email"}},t={args:{icon:i,type:"email",placeholder:"Enter email",error:"Email is required"}},o={render:l=>{const[s,c]=d.useState(!1);return e.jsx(a,{...l,type:s?"text":"password",rightElement:e.jsx("button",{type:"button",onClick:()=>c(p=>!p),className:"text-white/70 hover:text-white transition-colors","aria-label":s?"Hide password":"Show password",children:s?e.jsx(h,{className:"w-5 h-5"}):e.jsx(u,{className:"w-5 h-5"})})})},args:{placeholder:"Enter password"}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    icon: Mail,
    type: 'email',
    placeholder: 'Enter email'
  }
}`,...r.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    icon: Mail,
    type: 'email',
    placeholder: 'Enter email',
    error: 'Email is required'
  }
}`,...t.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: args => {
    const [visible, setVisible] = useState(false);
    return <ThemedInput {...args} type={visible ? 'text' : 'password'} rightElement={<button type="button" onClick={() => setVisible(v => !v)} className="text-white/70 hover:text-white transition-colors" aria-label={visible ? 'Hide password' : 'Show password'}>\r
            {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}\r
          </button>} />;
  },
  args: {
    placeholder: 'Enter password'
  }
}`,...o.parameters?.docs?.source}}};const k=["Email","WithErrorMessage","PasswordWithToggle"];export{r as Email,o as PasswordWithToggle,t as WithErrorMessage,k as __namedExportsOrder,S as default};

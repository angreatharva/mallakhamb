import{j as e}from"./iframe-B6P-JI9O.js";import r from"./RadialBurst-DTa5Htah.js";import"./preload-helper-PPVm8Dsz.js";import"./useReducedMotion-B8214p5W.js";const d={title:"Design System/Backgrounds/RadialBurst",component:r,argTypes:{color:{control:{type:"color"}},opacity:{control:{type:"number",min:0,max:1,step:.01}},position:{control:{type:"select"},options:["top-left","top-right","bottom-left","bottom-right","center"]},size:{control:{type:"select"},options:["sm","md","lg"]},className:{control:!1}}},t={args:{opacity:.2,position:"top-right",size:"md"},render:s=>e.jsxs("div",{className:"relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black",children:[e.jsx(r,{...s}),e.jsxs("div",{className:"relative z-10 p-6",children:[e.jsx("div",{className:"text-lg font-semibold",children:"Radial burst"}),e.jsx("div",{className:"mt-2 text-white/70",children:"Use for subtle accent lighting."})]})]})};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    opacity: 0.2,
    position: 'top-right',
    size: 'md'
  },
  render: args => <div className="relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black">\r
      <RadialBurst {...args} />\r
      <div className="relative z-10 p-6">\r
        <div className="text-lg font-semibold">Radial burst</div>\r
        <div className="mt-2 text-white/70">Use for subtle accent lighting.</div>\r
      </div>\r
    </div>
}`,...t.parameters?.docs?.source}}};const c=["Default"];export{t as Default,c as __namedExportsOrder,d as default};

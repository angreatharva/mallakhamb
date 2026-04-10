import{j as e}from"./iframe-B6P-JI9O.js";import{F as s}from"./FadeIn-BSItv_x8.js";import"./preload-helper-PPVm8Dsz.js";import"./useReducedMotion-B8214p5W.js";const n={title:"Design System/Animations/FadeIn",component:s,argTypes:{delay:{control:{type:"number",min:0,max:1e3,step:50}},direction:{control:{type:"select"},options:["up","down","left","right"]},className:{control:!1},children:{control:!1}}},r={args:{delay:100,direction:"up"},render:t=>e.jsxs("div",{className:"space-y-4",children:[e.jsx("div",{className:"text-white/70",children:"Scroll is not required in Storybook; it should animate on mount."}),e.jsx(s,{...t,children:e.jsxs("div",{className:"rounded-xl border border-white/10 bg-white/5 p-6",children:[e.jsx("div",{className:"text-lg font-semibold",children:"Fades in"}),e.jsx("div",{className:"mt-2 text-white/70",children:"Intersection Observer triggers once."})]})})]})};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    delay: 100,
    direction: 'up'
  },
  render: args => <div className="space-y-4">\r
      <div className="text-white/70">\r
        Scroll is not required in Storybook; it should animate on mount.\r
      </div>\r
      <FadeIn {...args}>\r
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">\r
          <div className="text-lg font-semibold">Fades in</div>\r
          <div className="mt-2 text-white/70">Intersection Observer triggers once.</div>\r
        </div>\r
      </FadeIn>\r
    </div>
}`,...r.parameters?.docs?.source}}};const l=["Default"];export{r as Default,l as __namedExportsOrder,n as default};

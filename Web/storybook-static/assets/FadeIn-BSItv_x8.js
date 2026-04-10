import{r,j as x}from"./iframe-B6P-JI9O.js";import{u as b}from"./useReducedMotion-B8214p5W.js";const g=({children:l,delay:a=0,direction:c="up",className:p=""})=>{const[n,o]=r.useState(!1),[s,d]=r.useState(!1),i=r.useRef(null),e=b();r.useEffect(()=>{const t=i.current;if(!t)return;if(e||s){o(!0);return}const u=new IntersectionObserver(f=>{f.forEach(h=>{h.isIntersecting&&!s&&(o(!0),d(!0))})},{threshold:.1,rootMargin:"50px"});return u.observe(t),()=>{t&&u.unobserve(t)}},[e,s]);const m={opacity:e||n?1:0,transform:(()=>{if(e||n)return"translate(0, 0)";switch(c){case"up":return"translate(0, 20px)";case"down":return"translate(0, -20px)";case"left":return"translate(20px, 0)";case"right":return"translate(-20px, 0)";default:return"translate(0, 20px)"}})(),transition:e?"none":`opacity 0.6s ease-out ${a}ms, transform 0.6s ease-out ${a}ms`};return x.jsx("div",{ref:i,style:m,className:p,children:l})};g.__docgenInfo={description:`FadeIn - Animation component that fades in content when it enters the viewport

Uses Intersection Observer for scroll-triggered animations.
Respects prefers-reduced-motion setting.
Animation runs once per element (idempotent).

@param {Object} props
@param {React.ReactNode} props.children - Content to animate
@param {number} props.delay - Delay before animation starts (in ms)
@param {'up'|'down'|'left'|'right'} props.direction - Direction of fade animation
@param {string} props.className - Additional CSS classes

@example
<FadeIn delay={200} direction="up">
  <h1>Welcome</h1>
</FadeIn>`,methods:[],displayName:"FadeIn",props:{delay:{defaultValue:{value:"0",computed:!1},required:!1},direction:{defaultValue:{value:"'up'",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1}}};export{g as F};

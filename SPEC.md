# Spec: Minimalist Solar System Web Page

## Objective
The goal is to build a simple, elegant, and minimalist web page that displays the 8 planets of our solar system. It is designed for students and space enthusiasts who want a quick, visually pleasing reference for basic planetary facts. Success is a single-page application that works seamlessly on desktop and mobile without any external dependencies.

## Tech Stack
- **HTML5**: Semantic tags for structure.
- **CSS3**: Vanilla CSS for layout (Flexbox/Grid), animations, and dark-themed minimalist aesthetics.
- **JavaScript**: ES6+ for data management and DOM manipulation.
- **No Frameworks**: Pure vanilla implementation to ensure lightweight performance and zero external requests.

## Commands
- **Build**: No build step required (Vanilla HTML/CSS/JS).
- **Test**: `npm test` (if unit tests are added) or manual verification in browser.
- **Lint**: `npx eslint .` (standard JS linting).
- **Dev**: `npx live-server repo` (or any local static server).

## Project Structure
The project will be contained within the `repo/` directory for isolation.
```
repo/
├── index.html        # Entry point and structure
├── style.css         # All styling and animations
├── script.js        # Planet data and interaction logic
└── .gitignore       # Local ignores
```

## Code Style
Clean, modular, and well-commented code. 
- **CSS**: Use variables for consistent theming.
  ```css
  :root {
    --space-black: #0a0a0b;
    --star-white: #f0f0f0;
    --planet-size-base: 20px;
  }
  ```
- **JS**: Use modern ES6 features like `const`/`let`, arrow functions, and template literals.
  ```javascript
  const planetData = [
    { name: "Mercury", distance: "57.9M km", fact: "Smallest planet." },
    // ...
  ];
  ```

## Testing Strategy
- **Manual Verification**: 
  - Cross-browser testing (Chrome, Firefox, Safari).
  - Responsive design check using mobile emulation in DevTools.
- **Functional Testing**:
  - Verify all 8 planets appear in order.
  - Confirm interaction (hover/click) displays the correct planetary information.
- **Performance**:
  - Ensure zero external network requests in the Network tab.
  - Page load time < 500ms.

## Boundaries
- **Always**: 
  - Use semantic HTML.
  - Use CSS gradients or basic shapes for planets (no image files).
  - Keep the design minimalist and dark-themed.
- **Ask First**: 
  - If adding more than one "fact" per planet.
  - If wanting to add background music or ambient sound.
- **Never**: 
  - Use external libraries (React, Tailwind, Bootstrap, etc.).
  - Include Pluto (strictly 8 planets).
  - Use any external assets (CDN fonts, icons, or images).

## Success Criteria
- [ ] 8 planets are rendered horizontally or in an orbital layout.
- [ ] Clicking or hovering on a planet displays its name, distance from the Sun, and one key fact.
- [ ] Dark "Space" theme is consistent and aesthetically pleasing.
- [ ] Page is fully responsive (mobile-friendly).
- [ ] Code is modular and contains no external dependencies.

## Open Questions
- Should the distances be relative or exact? (Decided: Millions of km for readability).
- Should the Sun be a static element on the left or part of the layout? (Decided: Visual anchor on the left).
- Is "hover" or "click" preferred for information display? (Decided: Hover for desktop, click for mobile/toggle).

---

### ASSUMPTIONS I'M MAKING:
1. "Minimalist" means focusing on essential information with high whitespace and subtle transitions.
2. "Planets in order" means starting from the Sun (Mercury to Neptune).
3. "Vanilla JS" means no transpilation or bundlers needed for the browser.
4. The user wants the project to reside in the `repo/` directory for the agentic workflow.

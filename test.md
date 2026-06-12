Now I want to change the design of the website, it looks good tho but I want it to be looking like glass display theme with futuristic yet minimal look. Change it for me with smooth transitions and good color palette. 

Act as an expert frontend engineer. I want to implement a heatmap component that looks excellent in both Light and Dark themes using a "Magma Variant" multi-hue palette. 

Please update the heatmap color scheme on the following specifications:

1. COLOR PALETTE (Magma Variant):
   - Low Intensity / Base: Deep Purple (#4C1D95) or Indigo (#6366F1)
   - Mid Intensity: Pink / Magenta (#EC4899)
   - High Intensity: Amber (#F59E0B) or Yellow (#FBBF24)

2. THEME ADAPTATION REQUIREMENTS:
   - Use CSS custom properties (variables) to define the heatmap color steps so they dynamically adapt when the theme changes.
   - For the lowest intensity values, utilize opacity/transparency so the natural background color of the theme (white/light gray vs. dark charcoal) bleeds through smoothly as the "zero" state.
   - Ensure high intensity colors are vibrant on dark mode but retain enough contrast/saturation so they don't look completely washed out on light mode.

The app works well but I have noticed when I log out and login again with a different account it still shows the data of the previous one, I have to refresh the data from the 'Refresh' button only then the account specific data is visible. Fix it.

Now since the app is running in local for which I am using credentials.json, this looks good for running in local. But now I would like to change things so that I can make it production ready. 
First make changes to run in my local how it would run in production.
Deploy the application in AWS services.
List down all the changes I would need to make for deploying it in AWS.

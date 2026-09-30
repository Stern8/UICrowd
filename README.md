# UICrowd
dynamic use of HTML in canvas and audio to generate unique results

## Crowdsign V2

`index.html` is a single self-contained page (three.js r128 from cdnjs, sounds and ticket art inlined as base64).
Open it in a browser, press Enter to sign in, and the login page becomes a stadium crowd display
(Cards / Tifo / Shirts modes, Mexican wave, camera views). See the in-page Help for shortcuts.

V2: fans sit in stadium seats (T toggles; they stand as the wave passes and for the tifo),
and arms are two-bone limbs (sleeve, upper arm, elbow, tapered forearm) solved with IK.

Rendering:
- Two levels of detail per block of fans; the nearest blocks (close-ups, the front edge under a tifo)
  switch to sculpted heads (jaw, brow, nose, ears), hairlines, fingers and shaped torsos and legs.
- Faces are a procedural texture atlas: 8 identities (glasses, beards, face paint) x closed/shouting mouth.
  Fans shout now and then and all shout as the wave passes. Hair colours, bald crowns and team beanies vary.
- Lighting: warm sun + sky ambient with analytic shadows from the stand roof and under the tifo;
  Sun height slider in Settings. Dark mode is a floodlit night match.
- Pitch: 105 x 68 m markings, mowing stripes that change with view direction, turf noise and wear,
  instanced grass blades near the camera (toggle in Settings), pitchside LED boards, sky dome.
- New Touchline camera (L).

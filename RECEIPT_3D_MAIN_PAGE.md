# Main Page 3D Receipt Rollout

## Goal

Move the main-page receipt experience toward the 3D paper treatment without
rewriting the live timer/printer flow in one pass.

## Phase 1 Completed: 3D Landing Receipt

What changed:

1. Kept the live printer strip as the existing HTML/CSS receipt.
2. Changed `ReceiptStack` so the currently landing receipt is temporarily
   removed from the DOM stack.
3. Added `components/tray/LandingReceipt3D.tsx`, a transparent R3F canvas that
   renders only the in-flight receipt as a textured paper mesh.
4. Reused the gallery texture pipeline from
   `components/session/three/useReceiptTexture.tsx`.
5. Reused the shared paper geometry and bend physics from
   `components/session/three/paperPhysics.ts`.
6. Animated the 3D receipt from the printer-slot offset down to the stack top.
7. On animation completion, called `clearLandingReceipt()` so the normal DOM
   stack takes over with the receipt at rest.
8. Added a readiness handoff: the DOM landing receipt remains visible until the
   3D texture is ready, then the 3D mesh takes over. This avoids a blank gap
   while the R3F bundle and receipt texture are preparing.

## Phase 2 Completed: Post-Cut Printer Receipt Goes 3D

The first phase still had a visible boundary: DOM at the printer, then 3D for
the landing. That could make the receipt disappear briefly after the cut
animation.

What changed:

1. Removed the fixed `finalizeComplete()` timeout from `PhotoCaptureModal`.
   Signing off now only attaches the photo/drawing and marks the cut receipt.
2. Added `components/tray/PrintedReceipt3D.tsx`.
3. `CutReceiptStrip` now waits for the DOM cut line animation to complete.
4. After the cut completes, it prepares a 3D texture from the printed receipt.
5. The DOM receipt remains visible until the 3D mesh is ready.
6. Once ready, the 3D printed receipt takes over at the printer slot and
   animates down to the stack.
7. At the end of that 3D landing, it calls `finalizeComplete()` and immediately
   clears `landingReceiptId`, so the normal stack appears at rest without
   replaying the older stack landing animation.

## Current Boundary

The normal receipt stack is still DOM-based once a landed receipt is at rest.
The printer-slot receipt is now 3D from active printing through cut and landing.

## Phase 3 Completed: Active Printer Receipt Goes 3D

The remaining visible boundary was the live growing receipt. It was DOM/CSS
while the timer was running, then changed to 3D after completion.

What changed:

1. Generalized `components/session/three/useReceiptTexture.tsx` so it can
   capture any receipt-shaped React node, not only saved `Receipt` objects.
2. Added `components/tray/LiveReceipt3D.tsx`.
3. `LiveReceiptStrip` now owns both the active task and cut-receipt states.
4. `Tray` now renders only `LiveReceiptStrip` at the printer slot; the separate
   `CutReceiptStrip` handoff is no longer used for the main flow.
5. The 3D live receipt keeps its previous texture visible while a newer texture
   is being prepared, which avoids flashing back to a blank object.
6. Live texture refresh is keyed by meaningful receipt changes: task id, minute
   bucket, timeline mode changes, frozen/cut state, and photo attachment. It is
   not recaptured every animation frame.
7. When the cut state is ready, the same 3D mesh draws the cut line, animates
   down to the stack, calls `finalizeComplete()`, then clears
   `landingReceiptId` so the stack appears at rest without replaying the older
   landing animation.

## Phase 3 Follow-Up: Sign-Off Image In 3D Fall

The direct canvas texture used for the live printer path originally drew the
header and grid but skipped the attached photo/drawing. That meant the sign-off
image only appeared after the receipt landed and the normal DOM stack took over.

What changed:

1. The fallback texture renderer now waits for `photoDataUrl` when the cut
   receipt is being textured.
2. The generated 3D texture reserves the same receipt body area for the
   sign-off image before drawing the grid/footer.
3. The cut/fall animation now starts only after that texture has been prepared,
   so photos and drawings are visible during the fall.

## Phase 3 Follow-Up: Restored Header/Image Print Reveal

The sign-off image fix made the full header/photo texture appear immediately
after sign-off, which removed the earlier printer-feed moment.

What changed:

1. Active task printing remains a 3D canvas.
2. Once sign-off is attached, the receipt temporarily shows the existing
   `ReceiptPrintStrip` reveal path for the header and photo/drawing.
3. The 3D full receipt texture is prepared behind that reveal.
4. After the reveal and cut line complete, the prepared 3D receipt takes over
   for the fall to the stack.

## Phase 4 Completed: Full Main-Page 3D Receipt Flow

The page is now closer to the intended interactive toy-like receipt printer:
the active printer receipt, the cut receipt, the falling receipt, and the
resting stack are all rendered as Three.js paper meshes.

What changed:

1. Replaced the normal DOM receipt stack with a transparent R3F stack canvas in
   `components/tray/ReceiptStack.tsx`.
2. Each stacked receipt now uses the shared receipt texture pipeline and the
   same segmented paper geometry used by the gallery.
3. Added subtle 3D depth, rotation, paper curl, and shadow layers to the stack
   so resting receipts still feel physical.
4. Removed the DOM reveal handoff from `LiveReceipt3D` when a 3D texture is
   available.
5. The printed header/photo reveal is now driven by a Three.js clipping plane
   on the live receipt mesh.
6. The cut line and fall now happen inside the same 3D mesh instead of
   switching from DOM to a separate landing object.
7. `finalizeComplete()` is called only after the 3D fall finishes, then the
   saved receipt appears in the 3D stack at rest.

Current boundary:

1. A hidden DOM receipt node is still used as the capture source when needed,
   but it is not the visible receipt once the texture exists.
2. Texture updates are snapshot-based rather than every animation frame, which
   keeps the page responsive while still showing meaningful print progress.

## Phase 5 Completed: No Blink Between Fall And Stack

The previous full-3D version still had a visible ownership change after the
fall: the live 3D mesh unmounted, then the stack created a new mesh for the
saved receipt. That could look like the receipt disappeared and came back.

What changed:

1. `LiveReceiptStrip` now parks the landed live mesh instead of unmounting it
   immediately after the fall completes.
2. `finalizeComplete()` still saves the receipt to the store right away, so the
   app state stays correct.
3. `ReceiptStack` pre-renders the just-saved landing receipt invisibly while
   the parked live mesh remains visible.
4. Once the stack texture exists, `Tray` passes that readiness back to
   `LiveReceiptStrip`.
5. The parked mesh is released in the next animation frame, revealing the
   already-prepared stack mesh underneath with no blank gap.
6. A fallback timeout releases the parked mesh if stack readiness is never
   reported, so the UI cannot get stuck.

## Phase 6 Completed: One Persistent 3D Receipt Stage

The Phase 5 overlap removed the empty gap, but it still eventually swapped the
fallen live mesh for a separate stack mesh. That could make the receipt look
like it changed after landing.

What changed:

1. Added `components/tray/ReceiptStage3D.tsx` as the single visible receipt
   canvas for the tray.
2. `Tray` now mounts `ReceiptStage3D` once at the printer slot instead of
   rendering a separate live canvas and a separate stack canvas.
3. A receipt now follows one visual lifecycle inside the same R3F scene:
   `live -> cut -> falling -> stacked`.
4. When the fall finishes, the same mounted mesh is kept in the scene as a
   landed visual. It is not replaced by the persisted receipt renderer.
5. `finalizeComplete()` still runs at landing time so task/session data is
   saved immediately.
6. Persisted receipts are only used to rebuild the stack on reload or for older
   receipts not already owned by the current session's live stage.
7. When the next task starts, the stage creates a new active mesh above the
   landed meshes instead of reprocessing the previous receipt.

## Phase 7 Completed: Perspective Printer-To-Tray Space

The persistent stage still used an orthographic camera, so moving on the z axis
did not create real depth or make falling receipts feel farther away.

What changed:

1. `ReceiptStage3D` now uses a perspective camera instead of an orthographic
   camera.
2. The active print receipt lives on a near printer plane, close to the camera.
3. The resting stack lives on a deeper tray plane, farther from the camera.
4. The fall animation now interpolates through that 3D space, moving the
   receipt deeper on the z axis while also lowering it to the stack plane.
5. Stack y positions are projected through the camera depth so the layout stays
   aligned while perspective makes the receipt smaller.
6. The print plane has a small top margin so freshly printed text is not clipped
   against the top of the receipt canvas.

## Phase 7 Follow-Up: Reserve The Top Stack Slot While Falling

The falling receipt was targeting the same top stack depth as the existing top
receipt until `finalizeComplete()` moved the stack around. That could make the
bottom edge look clipped during the fall, then suddenly appear complete after
landing.

What changed:

1. While an active receipt exists, the current stack is offset down one slot.
2. The active/falling receipt owns stack slot 0 from the start of the flow.
3. Older receipts stay behind it during the whole fall, avoiding z-fighting and
   bottom-edge clipping.
4. When the receipt lands, it is already occupying the correct top slot, so the
   stack does not need a visible reorder.

## Phase 7 Follow-Up: Shared Stack Landing Transform

The remaining pop came from the fall ending at a generic lower/deeper area and
then letting the stack positioning code move the receipt into its final layer.
That made the motion read as `fall -> adjust` instead of `fall -> land`.

What changed:

1. Added one shared stack transform helper for x/y/z, rotation, and scale.
2. The active receipt now falls directly to the same transform used for its
   final stack slot.
3. Resting live receipts and saved receipts use the same stack transform, so
   there is no separate post-landing correction.
4. Stack layers have wider y/z spacing, softer tilt, and deeper shadow planes
   to reduce visual clipping between overlapping receipt meshes.
5. Existing landed receipts move down one reserved slot while a new receipt is
   printing, keeping the new receipt as the known top layer throughout the
   whole cut and fall.
6. The active-to-stacked mode switch now applies the full stack transform in a
   layout effect, avoiding a one-frame printer-angle reset after landing.

## Phase 8 Started: Receipt Controller States

The code now treats landing as a controller handoff, not a conversion into a
new stack object. This matches the next interaction goal: once a receipt has
landed, the same 3D mesh should become available to tray interaction/physics.

What changed:

1. Renamed the visible mesh controller from `active`/`stacked` to
   `printer`/`resting`.
2. `printer` owns the transform while the receipt is printing, cutting, and
   falling.
3. `resting` owns the same mesh after it lands and keeps it in the tray stack.
4. Resting receipts now accept pointer pickup/drag without replacing the
   receipt or re-capturing its texture.
5. While dragged, the receipt is lifted toward the printer-depth plane, follows
   the pointer, and uses the same paper physics drag response as the gallery.
6. On release, the receipt settles back onto its tray depth while keeping the
   manually placed x/y position.
7. Saved/restored receipts use the same resting interaction path as receipts
   that landed during the current session.

## Phase 8 Follow-Up: Tighter Paper Stack Lighting

The first draggable stack spacing was too large, so the stack read more like
floating cards than thin receipts. The broad shadow planes also made the
receipts blend together instead of showing close contact.

What changed:

1. Reduced the y, z, x, and scale offsets between receipt layers.
2. Replaced the broad per-layer shadow with tighter contact shadows close to
   each receipt surface.
3. Contact shadows now fade by layer depth so nearby paper reads as close and
   lower paper does not become a muddy block.
4. Reduced the whole-stage drop shadow so per-sheet shadows do more of the
   lighting work.

## Phase 8 Follow-Up: Tray-Sized Drag Stage And Softer Shadows

The receipt canvas was still sized like the old receipt column, which made the
interactive drag bounds feel much smaller than the tray image.

What changed:

1. Expanded the R3F receipt stage to the full 720px tray scene width.
2. `Tray` now passes the tray surface height into `ReceiptStage3D`, so the
   receipt stage scales with the tray image.
3. The receipt camera FOV is recalculated from the stage height so expanding
   the canvas does not make the receipts visually change size.
4. Contact shadows now use a soft alpha texture instead of solid black planes,
   removing the sharp shadow edges on the paper.

## Phase 8 Follow-Up: Edge-Only Paper Shadow

The first shadow softening blurred the full receipt silhouette, which softened
the wrong edge. The shadow should sit on the paper overlap line between sheets.

What changed:

1. Removed the soft texture from the full contact-shadow plane.
2. Restored the full contact plane as a very low-opacity non-blurred shadow.
3. Added a narrow soft edge-shadow band on the upper overlap edge of each
   resting receipt.
4. The blurred shadow is now concentrated on the paper edge where one sheet
   visually overlaps the next.

Update:

1. Removed the edge-shadow band after visual review.
2. Kept only the low-opacity contact plane for minimal sheet separation.

## Phase 9 Follow-Up: Tactile Sound Effects

The app now uses the existing sound toggle for small synthesized Web Audio
effects instead of adding downloaded sound files.

What changed:

1. Added a shared client-side sound helper for button clicks, printer feed, and
   cut sounds.
2. Mounted a global button pointer listener so existing controls get a tactile
   click without wiring every button individually.
3. Started the printer feed loop while the 3D cut receipt is feeding and stopped
   it exactly when the cut sound plays.
4. Kept the implementation asset-free for now to avoid license cleanup and
   extra package weight.

# أغنية لهاللقطة

[Editable Figma design](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ)

| Reference | Figma | Local screenshot |
| --- | --- | --- |
| Brand identity | [Identity](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-11) | references/brand.webp |
| Start | [Start](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-60) | references/start.webp |
| Choose a song | [Track](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-68) | references/track.webp |
| Editor | [Editor](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-76) | references/editor.webp |
| Download | [Download](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-84) | references/export.webp |
| Story templates | [Templates](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-157) | references/templates.webp |
| UI states | [UI kit](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=1-218) | references/states.webp |
| Product plan | [Figma spec](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ?node-id=2-15) | IMPLEMENTATION.md |

## Brand tokens

| Role | Color |
| --- | --- |
| Page ink | `#211827` |
| Elevated surface | `#30243B` |
| Primary rose | `#FFABC4` |
| Paper | `#FFF1E6` |
| Muted text | `#DDC8D6` |
| Border | `#634A65` |
| Lavender accent | `#D2B8FF` |

Use Noto Sans Arabic (Regular and Bold) for the Arabic interface and IBM Plex Mono for URLs and dimensions. Keep controls readable and reachable on narrow screens. Use dark text on the rose primary action. The logo is a music note inside a viewfinder. The included `assets/mark.svg` is a vector reconstruction from the design. The Figma preview uses an illustrative photo and fictional song details.

## Templates

- **سينمائي**. Full-bleed user photo with a dark gradient under the credit and caption.
- **بولارويد**. Inset photo on a warm paper background, with the credit below.
- **لون من الغلاف**. Inset photo with a background based on the locally generated or user-supplied artwork. Use lavender when a palette cannot be derived. Keep foreground text legible.

The story canvas is separate from the editor UI. Keep the credit and caption inside the story's safe area. Render the three variants from the same composition logic used for export.

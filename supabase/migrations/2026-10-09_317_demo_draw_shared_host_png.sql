-- Replaces only untouched demo DRAW payloads with the approved scene and a shared GitHub Pages PNG.
-- The PNG is derived from docs/DEMO - Logo Rysunek.famlogo by tests/tools/extract-demo-draw-host-png.cjs.
-- User-edited demo logos differ from the exact old template payload and remain untouched.
BEGIN;

DO $migration$
DECLARE
  v_payload jsonb := $draw_payload${
  "w": 150,
  "h": 70,
  "format": "BITPACK_MSB_FIRST_ROW_MAJOR",
  "bits_b64": "/////////////////////////P////////////////////////z////////////////////////8/////////////////////////P////////////////////////z////////////////////////8/4AAAAAAAAAAAAAAAAAAAAAH/PgAAAAAAAAAAAAAAAAAAAAAAHz4f/////////////////////x8+P/////////////////////+fPj//////////////////////nz4///9//////////////////58+P///f/////////////////+fPj///z//////////////////nz4//+AD////////////+P///58+P//gA/gAAAAAAAAAB/j///+fPj//4Af4AAAAAAAAAAP4f///nz4///AH+AAAAAAAAAADgA///58+P//4D/gAAAAAAAAAA8AP//+fPj//+A/////////4AA/gP///nz4///gP////////////+D///58+P//xx/////////////g///+fPj//8/f////////////zP///nz4/////////////////9////58+P/////////////////////+fPj////w//4P/+D/+D///////nz4////8P/8A/+Af+AP//////58+P//3/D/+AH+AD/AD///+//+fPj//4/w/+P4fH8P3/P///n//nz4//+H8P/D/Hz/j5/x///5//58+P/4AfD/x/x8/4+/8f//8f/+fPj/8ADw/8f+fP//P/H//gAP/nz4//gB8P/H/n3//z/x//4AD/58+P/+A/D/z/59//8/8P//AA/+fPj//wPw/8/+ff//P/D//wA//nz4//8D8P/P/n34Bz/w///AP/58+P/+c/D/z/59+Ac/8P//wD/+fPj//nvw/8/+ffgHP/D//4A//nz4//7/8P/H/n3/hz/w//+EP/58+P////D/x/58/4c/8f//hj/+fPj////w/8f+fP+Hv/H//5+//nz4////8P/H/Hz/h7/x//////58+P////D/4fD8H4fH5//////+fPj///8w//Dx/h8PwY//7////nz4////MAB4A/8AH8AP/+f///58+P///hAAfgf/wH/wD//n///+fPj///4YAH8P/+H//n//5////nz4///+H////////////+P///58+P///B////////////wAf//+fPj///AB////////////wP///nz4///4A+AAAAAAAAAAP8H///58+P///A/AAAAAAAAAAA/A///+fPj///wPwAAAAAAAAAAPwP///nz4///8D8AAAAAAAAAAD5j///58+P///A///4AAAAAAAB+e///+fPj///wH/////////////////nz4///79/////////////////58+P/////////////////////+fPj//////////////////////nz4//////////////////////58+P/////////////////////8fPh/////////////////////+Hz4AAAAAAAAAAAAAAAAAAAAAAB8/4AAAAAAAAAAAAAAAAAAAAAH/P////////////////////////z////////////////////////8/////////////////////////P////////////////////////z////////////////////////8/////////////////////////A==",
  "source": {
    "bg": "WHITE",
    "mode": "DRAW",
    "world": {
      "h": 388,
      "w": 918
    },
    "fabricData": {
      "objects": [
        {
          "top": 109,
          "fill": "#000000",
          "left": 208,
          "path": null,
          "text": "LOGO",
          "type": "i-text",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 307.68,
          "height": 135.6,
          "scaleX": 1.42,
          "scaleY": 1.42,
          "shadow": null,
          "stroke": null,
          "styles": [],
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "fontSize": 120,
          "overline": false,
          "pathSide": "left",
          "direction": "ltr",
          "fontStyle": "normal",
          "pathAlign": "baseline",
          "textAlign": "center",
          "underline": false,
          "fontFamily": "'Arial Rounded MT Bold', Arial, sans-serif",
          "fontWeight": "normal",
          "lineHeight": 1,
          "paintFirst": "fill",
          "charSpacing": 0,
          "linethrough": false,
          "strokeWidth": 0,
          "strokeLineCap": "butt",
          "strokeUniform": false,
          "strokeLineJoin": "miter",
          "backgroundColor": "",
          "pathStartOffset": 0,
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "textBackgroundColor": "",
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 54.13,
          "fill": "#000",
          "left": 145.45,
          "path": [
            [
              "M",
              100.5,
              0
            ],
            [
              "L",
              109.4343358348456,
              25.702941685500797
            ],
            [
              "L",
              136.64014761921584,
              26.257354213752
            ],
            [
              "L",
              114.95605904768634,
              42.6970583144992
            ],
            [
              "L",
              122.83583958711398,
              68.742645786248
            ],
            [
              "L",
              100.5,
              53.2
            ],
            [
              "L",
              78.16416041288602,
              68.742645786248
            ],
            [
              "L",
              86.04394095231366,
              42.6970583144992
            ],
            [
              "L",
              64.35985238078416,
              26.257354213752002
            ],
            [
              "L",
              91.5656641651544,
              25.7029416855008
            ],
            [
              "Z"
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 72.28,
          "height": 68.74,
          "scaleX": 1,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 6,
          "_canHaveFill": true,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 239,
          "fill": "#000",
          "left": 156,
          "path": [
            [
              "M",
              85.5,
              0
            ],
            [
              "L",
              95.49234928897204,
              28.746711095625894
            ],
            [
              "L",
              125.91990194254402,
              29.366777739064737
            ],
            [
              "L",
              101.66796077701761,
              47.7532889043741
            ],
            [
              "L",
              110.4808732224301,
              76.88322226093527
            ],
            [
              "L",
              85.5,
              59.5
            ],
            [
              "L",
              60.519126777569895,
              76.88322226093527
            ],
            [
              "L",
              69.33203922298239,
              47.75328890437411
            ],
            [
              "L",
              45.08009805745597,
              29.36677773906474
            ],
            [
              "L",
              75.50765071102795,
              28.746711095625898
            ],
            [
              "Z"
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 80.84,
          "height": 76.88,
          "scaleX": 1,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 6,
          "_canHaveFill": true,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 70,
          "fill": "#000",
          "left": 685,
          "path": [
            [
              "M",
              36.5,
              0
            ],
            [
              "L",
              44.023651229343656,
              21.64458247200067
            ],
            [
              "L",
              66.93380852144492,
              22.11145618000168
            ],
            [
              "L",
              48.673523408577964,
              35.95541752799933
            ],
            [
              "L",
              55.30912807335914,
              57.88854381999832
            ],
            [
              "L",
              36.5,
              44.8
            ],
            [
              "L",
              17.690871926640863,
              57.88854381999832
            ],
            [
              "L",
              24.326476591422036,
              35.95541752799933
            ],
            [
              "L",
              6.0661914785550834,
              22.11145618000169
            ],
            [
              "L",
              28.976348770656344,
              21.64458247200067
            ],
            [
              "Z"
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 60.87,
          "height": 57.89,
          "scaleX": 1,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 6,
          "_canHaveFill": true,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 143.73,
          "fill": "#000",
          "left": 727,
          "path": [
            [
              "M",
              15,
              0
            ],
            [
              "L",
              17.938926261462367,
              8.454915028125264
            ],
            [
              "L",
              26.88820645368942,
              8.637287570313157
            ],
            [
              "L",
              19.755282581475768,
              14.045084971874736
            ],
            [
              "L",
              22.347315653655915,
              22.612712429686844
            ],
            [
              "L",
              15,
              17.5
            ],
            [
              "L",
              7.6526843463440875,
              22.612712429686844
            ],
            [
              "L",
              10.244717418524232,
              14.045084971874738
            ],
            [
              "L",
              3.1117935463105795,
              8.637287570313159
            ],
            [
              "L",
              12.061073738537633,
              8.454915028125264
            ],
            [
              "Z"
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 23.78,
          "height": 22.61,
          "scaleX": 3.48,
          "scaleY": 3.48,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 6,
          "_canHaveFill": true,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 243,
          "fill": "#000",
          "left": 680,
          "path": [
            [
              "M",
              107.5,
              0
            ],
            [
              "L",
              115.02365122934366,
              21.64458247200067
            ],
            [
              "L",
              137.93380852144492,
              22.11145618000168
            ],
            [
              "L",
              119.67352340857796,
              35.95541752799933
            ],
            [
              "L",
              126.30912807335915,
              57.88854381999832
            ],
            [
              "L",
              107.5,
              44.8
            ],
            [
              "L",
              88.69087192664087,
              57.88854381999832
            ],
            [
              "L",
              95.32647659142204,
              35.95541752799933
            ],
            [
              "L",
              77.06619147855508,
              22.11145618000169
            ],
            [
              "L",
              99.97634877065634,
              21.64458247200067
            ],
            [
              "Z"
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 60.87,
          "height": 57.89,
          "scaleX": 1,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 6,
          "_canHaveFill": true,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 82,
          "fill": "transparent",
          "left": 257,
          "path": [
            [
              "M",
              0,
              0
            ],
            [
              "L",
              387,
              2
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 387,
          "height": 2,
          "scaleX": 1,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 20,
          "_canHaveFill": false,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 282,
          "fill": "transparent",
          "left": 255,
          "path": [
            [
              "M",
              0,
              0
            ],
            [
              "L",
              387,
              2
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 387,
          "height": 2,
          "scaleX": 1,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 20,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "rx": 20,
          "ry": 20,
          "top": 27,
          "fill": "transparent",
          "left": 26,
          "type": "rect",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 835,
          "height": 317,
          "scaleX": 1.02,
          "scaleY": 1,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 17,
          "strokeLineCap": "round",
          "strokeUniform": false,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        },
        {
          "top": 144,
          "fill": "#000",
          "left": 123,
          "path": [
            [
              "M",
              15,
              0
            ],
            [
              "L",
              17.938926261462367,
              8.454915028125264
            ],
            [
              "L",
              26.88820645368942,
              8.637287570313157
            ],
            [
              "L",
              19.755282581475768,
              14.045084971874736
            ],
            [
              "L",
              22.347315653655915,
              22.612712429686844
            ],
            [
              "L",
              15,
              17.5
            ],
            [
              "L",
              7.6526843463440875,
              22.612712429686844
            ],
            [
              "L",
              10.244717418524232,
              14.045084971874738
            ],
            [
              "L",
              3.1117935463105795,
              8.637287570313159
            ],
            [
              "L",
              12.061073738537633,
              8.454915028125264
            ],
            [
              "Z"
            ]
          ],
          "type": "path",
          "angle": 0,
          "flipX": false,
          "flipY": false,
          "skewX": 0,
          "skewY": 0,
          "width": 23.78,
          "height": 22.61,
          "scaleX": 2.89,
          "scaleY": 2.89,
          "shadow": null,
          "stroke": "#000",
          "opacity": 1,
          "originX": "left",
          "originY": "top",
          "version": "5.3.0",
          "visible": true,
          "fillRule": "nonzero",
          "paintFirst": "fill",
          "strokeWidth": 6,
          "strokeLineCap": "round",
          "strokeUniform": true,
          "strokeLineJoin": "round",
          "backgroundColor": "",
          "strokeDashArray": null,
          "strokeDashOffset": 0,
          "strokeMiterLimit": 4,
          "globalCompositeOperation": "source-over"
        }
      ],
      "version": "5.3.0",
      "clipPath": {
        "rx": 0,
        "ry": 0,
        "top": 0,
        "fill": "rgb(0,0,0)",
        "left": 0,
        "type": "rect",
        "angle": 0,
        "flipX": false,
        "flipY": false,
        "skewX": 0,
        "skewY": 0,
        "width": 918,
        "height": 388,
        "scaleX": 1,
        "scaleY": 1,
        "shadow": null,
        "stroke": null,
        "opacity": 1,
        "originX": "left",
        "originY": "top",
        "version": "5.3.0",
        "visible": true,
        "fillRule": "nonzero",
        "paintFirst": "fill",
        "strokeWidth": 1,
        "strokeLineCap": "butt",
        "strokeUniform": false,
        "strokeLineJoin": "miter",
        "backgroundColor": "",
        "strokeDashArray": null,
        "strokeDashOffset": 0,
        "strokeMiterLimit": 4,
        "globalCompositeOperation": "source-over"
      },
      "background": "#ffffff"
    },
    "toolSettings": {
      "TEXT": {
        "fg": "WHITE",
        "bold": false,
        "font": "",
        "size": 80,
        "align": "center",
        "italic": false,
        "spacing": 0,
        "fontSize": 40,
        "underline": false,
        "lineHeight": 1
      },
      "BRUSH": {
        "fg": "WHITE",
        "stroke": 6,
        "lineStyle": "solid"
      },
      "ERASER": {
        "size": 10
      },
      "SHAPES": {
        "fg": "WHITE",
        "fill": false,
        "stroke": 6,
        "fillColor": "WHITE",
        "lineStyle": "solid"
      }
    },
    "hostRasterUrl": "https://www.familiada.online/logo/assets/demo-draw-host.png?v=20261009-demo-draw"
  }
}$draw_payload$::jsonb;
  v_template_rows integer;
BEGIN
  -- Use the old template contents as the exact signature for an untouched copy.
  UPDATE public.user_logos AS logo
     SET payload = v_payload
   WHERE logo.is_demo IS TRUE
     AND EXISTS (
       SELECT 1
         FROM public.demo_template_data AS template
        WHERE template.slot = 'logo_draw'
          AND logo.payload = template.payload -> 'payload'
     );

  UPDATE public.demo_template_data
     SET payload = jsonb_set(payload, '{payload}', v_payload, true)
   WHERE slot = 'logo_draw';

  GET DIAGNOSTICS v_template_rows = ROW_COUNT;
  IF v_template_rows <> 3 THEN
    RAISE EXCEPTION 'Expected 3 DRAW demo templates (pl/en/uk), updated %', v_template_rows;
  END IF;
END
$migration$;

COMMIT;

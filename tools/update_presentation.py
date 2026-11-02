#!/usr/bin/env python3
"""
CachyMusic Presentation Builder
Streamlined, humanized showcase presentation:
1. Cover slide
2. '1. What This Prototype Solves' (problem explanation + peer-to-peer sharing program)
3-6. Showcase slides containing pure screenshots (no descriptions, slide by slide)
7. Final slide showcasing 4 distinct themes
"""

import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

PPTX_PATH = '/home/lien/Documents/Projects/Music Player/CachyMusic_Presentation.pptx'
ARTIFACT_DIR = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c'

# Palette: High-Contrast, WCAG-Compliant, Sleek Dark Canvas
COLOR_BG = RGBColor(11, 14, 20)          # #0B0E14
COLOR_CARD = RGBColor(19, 23, 34)        # #131722
COLOR_BORDER = RGBColor(45, 55, 78)      # #2D374E
COLOR_ACCENT = RGBColor(56, 189, 248)    # #38BDF8 (Sky Cyan)
COLOR_TITLE = RGBColor(255, 255, 255)    # #FFFFFF
COLOR_BODY = RGBColor(226, 232, 240)     # #E2E8F0
COLOR_MUTED = RGBColor(148, 163, 184)    # #94A3B8

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.50)
    blank_layout = prs.slide_layouts[6]

    def set_slide_background(slide):
        bg = slide.background
        fill = bg.fill
        fill.solid()
        fill.fore_color.rgb = COLOR_BG

    def add_styled_paragraph(tf, text, size=11, bold=False, color=COLOR_BODY, space_after=0, is_first=False, font_name="Arial", align=PP_ALIGN.LEFT):
        p = tf.paragraphs[0] if is_first else tf.add_paragraph()
        p.text = ""
        p.space_after = Pt(space_after)
        p.alignment = align
        run = p.add_run()
        run.text = text
        run.font.name = font_name
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        return p

    def add_screenshot_frame(slide, img_path, left, top, width, height):
        """Adds a subtle container border and embeds the screenshot inside it."""
        # Container card / bezel
        bezel = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left - Inches(0.04), top - Inches(0.04), width + Inches(0.08), height + Inches(0.08))
        bezel.fill.solid()
        bezel.fill.fore_color.rgb = COLOR_CARD
        bezel.line.color.rgb = COLOR_BORDER
        bezel.line.width = Pt(1.5)

        if os.path.exists(img_path):
            slide.shapes.add_picture(img_path, left, top, width=width, height=height)

    # =========================================================================
    # SLIDE 1: Cover Slide
    # =========================================================================
    print("Building Slide 1: Cover Slide...")
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1)

    # Accent decorative bar
    bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.20), Inches(2.30), Inches(0.08), Inches(2.90))
    bar.fill.solid()
    bar.fill.fore_color.rgb = COLOR_ACCENT
    bar.line.color.rgb = COLOR_ACCENT

    # Cover text box
    tb1 = s1.shapes.add_textbox(Inches(1.50), Inches(2.15), Inches(10.50), Inches(3.20))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    add_styled_paragraph(tf1, "PROJECT SHOWCASE & PROTOTYPE DEMONSTRATION", size=12, bold=True, color=COLOR_ACCENT, space_after=6, is_first=True)
    add_styled_paragraph(tf1, "CachyMusic", size=46, bold=True, color=COLOR_TITLE, space_after=6)
    add_styled_paragraph(tf1, "A Focused, Distraction-Free Audio Player Prototype", size=21, bold=False, color=COLOR_BODY, space_after=18)
    add_styled_paragraph(tf1, "Tactile Vinyl Turntable  •  Peer-to-Peer Music Sharing  •  Audiophile DSP", size=12, bold=False, color=COLOR_MUTED)

    s1.notes_slide.notes_text_frame.text = (
        "Presenter Notes:\n"
        "• Welcome everyone. Today I'm excited to showcase CachyMusic, a web audio player prototype designed to restore tactile joy, simplicity, and user ownership to personal music listening.\n"
        "• We will explore what problems this prototype solves, walk through clean visual screenshots of the application, and view its built-in personalization themes."
    )

    # =========================================================================
    # SLIDE 2: What This Prototype Solves
    # =========================================================================
    print("Building Slide 2: What This Prototype Solves...")
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2)

    # Header
    tb_h2 = s2.shapes.add_textbox(Inches(1.00), Inches(0.60), Inches(11.333), Inches(0.90))
    tf_h2 = tb_h2.text_frame
    tf_h2.word_wrap = True
    add_styled_paragraph(tf_h2, "01 / PROTOTYPE VISION", size=11, bold=True, color=COLOR_ACCENT, space_after=2, is_first=True)
    add_styled_paragraph(tf_h2, "Why CachyMusic?", size=26, bold=True, color=COLOR_TITLE)

    # Card 1: What This Prototype Solves
    c1 = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.00), Inches(1.80), Inches(11.333), Inches(2.25))
    c1.fill.solid()
    c1.fill.fore_color.rgb = COLOR_CARD
    c1.line.color.rgb = COLOR_BORDER
    c1.line.width = Pt(1.5)
    tf_c1 = c1.text_frame
    tf_c1.word_wrap = True
    tf_c1.margin_left = Inches(0.40)
    tf_c1.margin_right = Inches(0.40)
    tf_c1.margin_top = Inches(0.30)
    tf_c1.margin_bottom = Inches(0.30)

    add_styled_paragraph(tf_c1, "1. What This Prototype Solves", size=15, bold=True, color=COLOR_ACCENT, space_after=6, is_first=True)
    add_styled_paragraph(
        tf_c1,
        "Mainstream streaming apps have become noisy storefronts filled with algorithmic suggestions, social feeds, and ads. "
        "This prototype brings the focus strictly back to your own audio files with an uncluttered, fast interface.",
        size=12.5, bold=False, color=COLOR_BODY, space_after=0
    )

    # Card 2: Decentralized Peer-to-Peer File Sharing
    c2 = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.00), Inches(4.35), Inches(11.333), Inches(2.25))
    c2.fill.solid()
    c2.fill.fore_color.rgb = COLOR_CARD
    c2.line.color.rgb = COLOR_BORDER
    c2.line.width = Pt(1.5)
    tf_c2 = c2.text_frame
    tf_c2.word_wrap = True
    tf_c2.margin_left = Inches(0.40)
    tf_c2.margin_right = Inches(0.40)
    tf_c2.margin_top = Inches(0.30)
    tf_c2.margin_bottom = Inches(0.30)

    add_styled_paragraph(tf_c2, "2. Decentralized Peer-to-Peer File Sharing", size=15, bold=True, color=COLOR_ACCENT, space_after=6, is_first=True)
    add_styled_paragraph(
        tf_c2,
        "Commercial streaming services lock users into subscription models that constantly track listening habits, gatekeep independent artists, "
        "and delete albums without notice. CachyMusic integrates a decentralized peer-to-peer file sharing client (Nicotine+ / Soulseek network), "
        "allowing music enthusiasts to discover, exchange, and download rare recordings and community audio directly between peers—giving you true "
        "offline ownership of your music library.",
        size=12, bold=False, color=COLOR_BODY, space_after=0
    )

    s2.notes_slide.notes_text_frame.text = (
        "Presenter Notes:\n"
        "• Point 1: Mainstream streaming apps have morphed into noisy storefronts loaded with algorithmic feeds, podcasts, and intrusive ads. CachyMusic restores a clean, laser-focused player dedicated entirely to your audio files.\n"
        "• Point 2: We incorporate direct peer-to-peer file sharing via the Soulseek network. Rather than relying on cloud corporations that can remove songs at any moment, users connect peer-to-peer to discover and download independent music directly."
    )

    # =========================================================================
    # SHOWCASE SLIDES (Slides 3 to 6): Pure Screenshots, No Descriptions
    # =========================================================================
    showcase_slides = [
        ("Slide 3: Main Player Deck & Turntable", "showcase_player.png", "The interactive player deck with animated tonearm, vinyl record, tracklist, and metadata inspector."),
        ("Slide 4: Turntable Focus Stage (Tracks & Metadata Untoggled)", "showcase_zen_player.png", "Focus view with tracklist and metadata inspector untoggled, dedicating 100% of the screen to the tactile turntable deck and real-time audio visualizer."),
        ("Slide 5: Settings & Studio Audio DSP", "showcase_settings.png", "Audiophile settings suite with 10-band parametric equalizer, Bauer binaural crossfeed, and subsonic rumble filter."),
        ("Slide 6: Peer-to-Peer Sharing Network (Seek)", "showcase_seek.png", "The integrated Seek workspace connecting to decentralized peer networks for direct music discovery and file exchange.")
    ]

    # Target geometry for screenshots: 1440x763 aspect ratio = 1.887
    # Slide width = 13.333", height = 7.50"
    # An image width of 11.80" gives height = 6.25", top = 0.625", left = 0.766"
    IMG_W = Inches(11.80)
    IMG_H = Inches(6.25)
    IMG_LEFT = Inches((13.333 - 11.80) / 2)  # ~0.766"
    IMG_TOP = Inches((7.50 - 6.25) / 2)      # 0.625"

    for title_label, img_filename, presenter_context in showcase_slides:
        print(f"Building {title_label}...")
        s = prs.slides.add_slide(blank_layout)
        set_slide_background(s)

        img_path = os.path.join(ARTIFACT_DIR, img_filename)
        add_screenshot_frame(s, img_path, IMG_LEFT, IMG_TOP, IMG_W, IMG_H)

        s.notes_slide.notes_text_frame.text = (
            f"Presenter Notes:\n"
            f"• Showcase: {presenter_context}"
        )

    # =========================================================================
    # SLIDE 7: Final Slide — Multi-Theme Showcase (4 Themes)
    # =========================================================================
    print("Building Slide 7: Themes Showcase (4 Themes)...")
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7)

    # Subtle header tag for theme slide
    tb_h7 = s7.shapes.add_textbox(Inches(0.80), Inches(0.40), Inches(11.733), Inches(0.70))
    tf_h7 = tb_h7.text_frame
    tf_h7.word_wrap = True
    add_styled_paragraph(tf_h7, "VISUAL PERSONALIZATION", size=10, bold=True, color=COLOR_ACCENT, space_after=1, is_first=True)
    add_styled_paragraph(tf_h7, "Diverse Aesthetic Themes for Every Mood", size=20, bold=True, color=COLOR_TITLE)

    # 2x2 Grid of 4 Themes:
    CARD_W = Inches(5.65)
    CARD_H = Inches(2.40)
    GAP_X = Inches(0.43)

    COL1_LEFT = Inches(0.80)
    COL2_LEFT = COL1_LEFT + CARD_W + GAP_X

    ROW1_LABEL_TOP = Inches(1.22)
    ROW1_IMG_TOP = Inches(1.50)

    ROW2_LABEL_TOP = Inches(4.30)
    ROW2_IMG_TOP = Inches(4.58)

    theme_cards = [
        ("The Atlas (Retro Sci-Fi)", "showcase_theme_nms.png", COL1_LEFT, ROW1_LABEL_TOP, ROW1_IMG_TOP),
        ("Minimalist Warm (Paper & Amber)", "showcase_theme_warm.png", COL2_LEFT, ROW1_LABEL_TOP, ROW1_IMG_TOP),
        ("Sentinel (Neon Cyan Cyberpunk)", "showcase_theme_sentinel.png", COL1_LEFT, ROW2_LABEL_TOP, ROW2_IMG_TOP),
        ("Solar Eclipse (High-Contrast Gold)", "showcase_theme_solar.png", COL2_LEFT, ROW2_LABEL_TOP, ROW2_IMG_TOP)
    ]

    for label, fname, left, label_top, img_top in theme_cards:
        # Theme label above the card
        lbl_box = s7.shapes.add_textbox(left, label_top, CARD_W, Inches(0.26))
        lbl_tf = lbl_box.text_frame
        lbl_tf.margin_left = Inches(0.0)
        lbl_tf.margin_top = Inches(0.0)
        lbl_tf.margin_bottom = Inches(0.0)
        lbl_tf.margin_right = Inches(0.0)
        add_styled_paragraph(lbl_tf, label, size=11, bold=True, color=COLOR_BODY, is_first=True)

        img_path = os.path.join(ARTIFACT_DIR, fname)
        add_screenshot_frame(s7, img_path, left, img_top, CARD_W, CARD_H)

    s7.notes_slide.notes_text_frame.text = (
        "Presenter Notes:\n"
        "• Themes Showcase: CachyMusic offers multiple tailored visual themes ranging from high-contrast brutalist and paper warm to atmospheric sci-fi and cyberpunk aesthetics.\n"
        "• Each theme dynamically transforms the entire interface, turntable platter, and center visualizer.\n"
        "• Thank you! That concludes the presentation walkthrough."
    )

    prs.save(PPTX_PATH)
    print("Presentation successfully updated and saved to:", PPTX_PATH)

if __name__ == '__main__':
    create_deck()

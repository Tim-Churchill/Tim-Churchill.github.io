from manim import *

class LiquidLensMagnetMath(Scene):
    def construct(self):
        self.camera.background_color = "#0f1318"

        title = Text("Liquid Lens: Magnetic Force (Back-of-Envelope)", font_size=36, color=WHITE)
        title.to_edge(UP)

        # Sphere and 4 magnetic points (projected)
        sphere = Circle(radius=1.3, color=BLUE_E).shift(LEFT * 3.4)
        sphere_label = Text("Liquid", font_size=24, color=BLUE_B).next_to(sphere, DOWN)

        points = VGroup(
            Dot(point=sphere.get_center() + UP * 1.1, color=RED),
            Dot(point=sphere.get_center() + DOWN * 1.1, color=RED),
            Dot(point=sphere.get_center() + LEFT * 1.1, color=RED),
            Dot(point=sphere.get_center() + RIGHT * 1.1, color=RED),
        )
        point_label = Text("4 magnetic points", font_size=20, color=RED_E).next_to(sphere, RIGHT, buff=0.6)

        # Equation block (plain text to avoid LaTeX dependency)
        eq1 = Text("F = (chi V / 2 mu0) * grad(B^2)", font_size=26, color=WHITE)
        eq2 = Text("grad(B^2) = sum_i grad(B_i^2)", font_size=24, color=GRAY_C)
        eq_block = VGroup(eq1, eq2).arrange(DOWN, aligned_edge=LEFT, buff=0.25).shift(RIGHT * 2.8 + UP * 0.5)

        # Ratio bar chart for Gd vs Mn (chi proportional to mu_eff^2)
        ratio_title = Text("Relative susceptibility (same concentration)", font_size=22, color=WHITE)
        ratio_title.shift(RIGHT * 2.9 + DOWN * 0.8)

        bar_base = Line(LEFT * 1.6, RIGHT * 1.6, color=GRAY_D)
        bar_base.shift(RIGHT * 2.9 + DOWN * 1.6)

        mn_bar = Rectangle(width=1.2, height=0.25, color=BLUE_C, fill_opacity=1.0)
        gd_bar = Rectangle(width=2.15, height=0.25, color=GREEN_C, fill_opacity=1.0)
        mn_bar.move_to(bar_base.get_left() + RIGHT * 0.6)
        gd_bar.move_to(bar_base.get_left() + RIGHT * 1.1 + DOWN * 0.4)

        mn_label = Text("MnCl2", font_size=20, color=BLUE_C).next_to(mn_bar, LEFT, buff=0.25)
        gd_label = Text("Gd(NO3)3", font_size=20, color=GREEN_C).next_to(gd_bar, LEFT, buff=0.25)

        ratio_note = Text("chi_Gd ~ 1.8 x chi_Mn", font_size=20, color=WHITE)
        ratio_note.next_to(gd_bar, RIGHT, buff=0.4)

        # Gradient arrow
        grad_arrow = Arrow(start=sphere.get_center(), end=sphere.get_center() + UP * 1.6, color=YELLOW)
        grad_label = Text("net grad(B^2)", font_size=20, color=YELLOW).next_to(grad_arrow, LEFT, buff=0.2)

        # Animation sequence
        self.play(FadeIn(title))
        self.play(Create(sphere), FadeIn(sphere_label))
        self.play(FadeIn(points), FadeIn(point_label))
        self.play(GrowArrow(grad_arrow), FadeIn(grad_label))
        self.play(FadeIn(eq_block))
        self.wait(0.5)
        self.play(FadeIn(ratio_title))
        self.play(Create(bar_base))
        self.play(GrowFromEdge(mn_bar, LEFT), FadeIn(mn_label))
        self.play(GrowFromEdge(gd_bar, LEFT), FadeIn(gd_label))
        self.play(FadeIn(ratio_note))
        self.wait(1.5)

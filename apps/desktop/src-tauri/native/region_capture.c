#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <dlfcn.h>
#include <objc/runtime.h>
#include <objc/message.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>
#include <CoreFoundation/CoreFoundation.h>

#define HARPY_CAPTURE_OK 0
#define HARPY_CAPTURE_CANCELLED 1
#define HARPY_CAPTURE_FAILED 2

#define OVERLAY_WINDOW_CLASS "HarpyRegionWindow"
#define OVERLAY_VIEW_CLASS "HarpyRegionView"

#define EVENT_MOUSE_DOWN 1
#define EVENT_MOUSE_UP 2
#define EVENT_MOUSE_DRAGGED 6
#define EVENT_KEY_DOWN 10
#define KEY_CODE_ESCAPE 53

#define MIN_SELECTION_POINTS 3.0
#define DIM_ALPHA 0.28
#define FRAME_LINE_WIDTH 2.0
#define FRAME_RED 0.85
#define FRAME_GREEN 0.20
#define FRAME_BLUE 0.20

/* The frame is stroked centred on the selection's edge, so half a line width
   spills outside it; one more point covers antialiasing. */
#define FRAME_DIRTY_PAD (FRAME_LINE_WIDTH + 1.0)

#define BITMAP_BITS_PER_COMPONENT 8
#define BITMAP_AUTO_BYTES_PER_ROW 0
#define MIN_SCALED_SIDE_PX 1

enum { ST_ACTIVE = 0, ST_DONE = 1, ST_CANCELLED = 2 };

static int g_state;
static CGPoint g_start;
static CGRect g_sel;
static int g_have_sel;
static double g_scr_w, g_scr_h;
static id g_view;
static CGImageRef g_full;

static id ocls(const char *n) { return (id)objc_getClass(n); }
static SEL SL(const char *n) { return sel_registerName(n); }
static id call0(id o, const char *s) {
    return ((id (*)(id, SEL))objc_msgSend)(o, SL(s));
}

static void set_error(char *err, size_t err_len, const char *message) {
    if (err && err_len > 0) snprintf(err, err_len, "%s", message);
}

static CGRect screen_rect(void) { return CGRectMake(0, 0, g_scr_w, g_scr_h); }

/* Repainting only what changed is the whole point of the dirty rect, so the
   veil is filled over `dirty` and not over the screen. AppKit clips the context
   to the invalidated region anyway, but the fill would still be measured
   against a screen-sized rectangle. */
static void draw_rect_impl(id self, SEL cmd, CGRect dirty) {
    (void)self; (void)cmd;
    id nsctx = call0(ocls("NSGraphicsContext"), "currentContext");
    if (!nsctx) return;
    CGContextRef c = (CGContextRef)((void *(*)(id, SEL))objc_msgSend)(nsctx, SL("CGContext"));
    if (!c) return;
    CGRect area = CGRectIntersection(dirty, screen_rect());
    if (CGRectIsEmpty(area)) return;
    CGContextSetRGBFillColor(c, 0, 0, 0, DIM_ALPHA);
    CGContextFillRect(c, area);
    if (g_have_sel && g_sel.size.width > 0 && g_sel.size.height > 0) {
        CGRect hole = CGRectIntersection(g_sel, area);
        if (!CGRectIsEmpty(hole)) CGContextClearRect(c, hole);
        CGContextSetRGBStrokeColor(c, FRAME_RED, FRAME_GREEN, FRAME_BLUE, 1.0);
        CGContextSetLineWidth(c, FRAME_LINE_WIDTH);
        /* The stroke is issued whole and clipped by AppKit to `area`. */
        CGContextStrokeRect(c, g_sel);
    }
}

static BOOL yes_impl(id self, SEL cmd) { (void)self; (void)cmd; return YES; }

static CGRect padded(CGRect area) {
    return CGRectInset(area, -FRAME_DIRTY_PAD, -FRAME_DIRTY_PAD);
}

/* -[NSView display] marked the WHOLE screen-sized view dirty and redrew it
   synchronously, so dragging the selection re-rasterized a 4K/5K screen on
   every mouse-move (100+/s) — which is why the frame lagged the cursor. Only
   the band the selection moved through has actually changed: the union of the
   old and the new rectangle, padded for the stroke. That is the same geometry
   the Windows backend computes in `dirty_area`.

   The invalidation is deliberately asynchronous: AppKit coalesces several
   mouse-moves into one redraw, and our event loop runs the run loop through
   `nextEventMatchingMask:` in the default mode, where the window's display
   observer fires before it blocks. */
static void redraw_selection(CGRect before, int had_before) {
    if (!g_view) return;
    CGRect dirty;
    if (had_before && g_have_sel) dirty = CGRectUnion(padded(before), padded(g_sel));
    else if (had_before) dirty = padded(before);
    else if (g_have_sel) dirty = padded(g_sel);
    else return;
    ((void (*)(id, SEL, CGRect))objc_msgSend)(g_view, SL("setNeedsDisplayInRect:"), dirty);
}

static Class overlay_window_class(void) {
    Class existing = objc_getClass(OVERLAY_WINDOW_CLASS);
    if (existing) return existing;
    Class cls = objc_allocateClassPair(objc_getClass("NSWindow"), OVERLAY_WINDOW_CLASS, 0);
    if (!cls) return NULL;
    class_addMethod(cls, SL("canBecomeKeyWindow"), (IMP)yes_impl, "B@:");
    objc_registerClassPair(cls);
    return cls;
}

static Class overlay_view_class(void) {
    Class existing = objc_getClass(OVERLAY_VIEW_CLASS);
    if (existing) return existing;
    Class cls = objc_allocateClassPair(objc_getClass("NSView"), OVERLAY_VIEW_CLASS, 0);
    if (!cls) return NULL;
    class_addMethod(cls, SL("drawRect:"), (IMP)draw_rect_impl,
                    "v@:{CGRect={CGPoint=dd}{CGSize=dd}}");
    objc_registerClassPair(cls);
    return cls;
}

static int encode_png(CGImageRef image, unsigned char **out_png, size_t *out_len,
                      char *err, size_t err_len) {
    CFMutableDataRef data = CFDataCreateMutable(NULL, 0);
    if (!data) {
        set_error(err, err_len, "не удалось выделить буфер PNG");
        return HARPY_CAPTURE_FAILED;
    }
    CGImageDestinationRef dest =
        CGImageDestinationCreateWithData(data, CFSTR("public.png"), 1, NULL);
    if (!dest) {
        CFRelease(data);
        set_error(err, err_len, "не удалось создать PNG-энкодер");
        return HARPY_CAPTURE_FAILED;
    }
    CGImageDestinationAddImage(dest, image, NULL);
    if (!CGImageDestinationFinalize(dest)) {
        CFRelease(dest);
        CFRelease(data);
        set_error(err, err_len, "не удалось закодировать PNG");
        return HARPY_CAPTURE_FAILED;
    }
    long len = CFDataGetLength(data);
    unsigned char *copy = malloc((size_t)len);
    if (!copy) {
        CFRelease(dest);
        CFRelease(data);
        set_error(err, err_len, "не хватило памяти под снимок");
        return HARPY_CAPTURE_FAILED;
    }
    memcpy(copy, CFDataGetBytePtr(data), (size_t)len);
    CFRelease(dest);
    CFRelease(data);
    *out_png = copy;
    *out_len = (size_t)len;
    return HARPY_CAPTURE_OK;
}

/* The API downsamples anything past ~1568 px on the long edge on arrival, and
   the same image is re-uploaded on every turn of the chat — so a Retina shot
   pays for its second pixel over and over. The limit itself comes from Rust
   (`screenshot::resample::MAX_LONG_EDGE_PX`) so the two backends cannot drift.
   kCGInterpolationHigh is what keeps text in the shot legible; the source's own
   colour space is reused so the pixels are only made smaller, not repainted.
   Returns NULL when the image already fits, and also when the scratch context
   cannot be made — in both cases the caller keeps the original, because
   shipping a full-resolution shot beats shipping none. */
static CGImageRef image_capped_to(CGImageRef image, size_t max_long_edge) {
    size_t width = CGImageGetWidth(image);
    size_t height = CGImageGetHeight(image);
    size_t longest = width > height ? width : height;
    if (max_long_edge == 0 || longest == 0 || longest <= max_long_edge) return NULL;
    double factor = (double)max_long_edge / (double)longest;
    size_t target_w = (size_t)lround((double)width * factor);
    size_t target_h = (size_t)lround((double)height * factor);
    if (target_w < MIN_SCALED_SIDE_PX) target_w = MIN_SCALED_SIDE_PX;
    if (target_h < MIN_SCALED_SIDE_PX) target_h = MIN_SCALED_SIDE_PX;

    CGColorSpaceRef space = CGImageGetColorSpace(image);
    CGColorSpaceRef owned = NULL;
    if (!space || CGColorSpaceGetModel(space) != kCGColorSpaceModelRGB) {
        owned = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        space = owned;
    }
    if (!space) return NULL;
    CGContextRef ctx = CGBitmapContextCreate(NULL, target_w, target_h,
                                             BITMAP_BITS_PER_COMPONENT,
                                             BITMAP_AUTO_BYTES_PER_ROW, space,
                                             kCGImageAlphaNoneSkipLast | kCGBitmapByteOrder32Big);
    if (owned) CGColorSpaceRelease(owned);
    if (!ctx) return NULL;
    CGContextSetInterpolationQuality(ctx, kCGInterpolationHigh);
    CGContextDrawImage(ctx, CGRectMake(0, 0, (double)target_w, (double)target_h), image);
    CGImageRef scaled = CGBitmapContextCreateImage(ctx);
    CGContextRelease(ctx);
    return scaled;
}

static int crop_selection(CGImageRef *out_image, size_t max_long_edge,
                          char *err, size_t err_len) {
    double sx = (double)CGImageGetWidth(g_full) / g_scr_w;
    double sy = (double)CGImageGetHeight(g_full) / g_scr_h;
    CGRect pixels = CGRectMake(g_sel.origin.x * sx,
                               (g_scr_h - (g_sel.origin.y + g_sel.size.height)) * sy,
                               g_sel.size.width * sx,
                               g_sel.size.height * sy);
    CGImageRef crop = CGImageCreateWithImageInRect(g_full, pixels);
    if (!crop) {
        set_error(err, err_len, "не удалось вырезать область");
        return HARPY_CAPTURE_FAILED;
    }
    CGImageRef capped = image_capped_to(crop, max_long_edge);
    if (capped) {
        CGImageRelease(crop);
        crop = capped;
    }
    *out_image = crop;
    return HARPY_CAPTURE_OK;
}

typedef CGImageRef (*display_capture_fn)(CGDirectDisplayID);

/* Runs the overlay and hands back the selected image, NOT a PNG: encoding it is
   the caller's second call and belongs on another thread. Only the capture
   needs AppKit's main thread. */
int harpy_capture_region(size_t max_long_edge_px, void **out_image,
                         char *err, size_t err_len) {
    id pool = call0(call0(ocls("NSAutoreleasePool"), "alloc"), "init");

    g_state = ST_ACTIVE;
    g_have_sel = 0;
    g_sel = CGRectMake(0, 0, 0, 0);
    g_full = NULL;
    g_view = NULL;

    CGRect screen = CGDisplayBounds(CGMainDisplayID());
    g_scr_w = screen.size.width;
    g_scr_h = screen.size.height;

    display_capture_fn capture_display =
        (display_capture_fn)dlsym(RTLD_DEFAULT, "CGDisplayCreateImage");
    if (!capture_display) {
        set_error(err, err_len, "CGDisplayCreateImage недоступна на этой macOS");
        call0(pool, "drain");
        return HARPY_CAPTURE_FAILED;
    }
    g_full = capture_display(CGMainDisplayID());
    if (!g_full) {
        set_error(err, err_len, "не удалось снять экран — проверь разрешение «Запись экрана»");
        call0(pool, "drain");
        return HARPY_CAPTURE_FAILED;
    }

    Class win_cls = overlay_window_class();
    Class view_cls = overlay_view_class();
    if (!win_cls || !view_cls) {
        CGImageRelease(g_full);
        set_error(err, err_len, "не удалось создать оверлей выделения");
        call0(pool, "drain");
        return HARPY_CAPTURE_FAILED;
    }

    id app = call0(ocls("NSApplication"), "sharedApplication");

    id win = call0((id)win_cls, "alloc");
    win = ((id (*)(id, SEL, CGRect, unsigned long, unsigned long, BOOL))objc_msgSend)(
        win, SL("initWithContentRect:styleMask:backing:defer:"),
        CGRectMake(0, 0, g_scr_w, g_scr_h), 0UL, 2UL, NO);
    ((void (*)(id, SEL, BOOL))objc_msgSend)(win, SL("setOpaque:"), NO);
    ((void (*)(id, SEL, id))objc_msgSend)(win, SL("setBackgroundColor:"),
                                          call0(ocls("NSColor"), "clearColor"));
    ((void (*)(id, SEL, long))objc_msgSend)(win, SL("setLevel:"),
                                            (long)CGShieldingWindowLevel());

    id view = call0((id)view_cls, "alloc");
    view = ((id (*)(id, SEL, CGRect))objc_msgSend)(view, SL("initWithFrame:"),
                                                   CGRectMake(0, 0, g_scr_w, g_scr_h));
    g_view = view;
    ((void (*)(id, SEL, id))objc_msgSend)(win, SL("setContentView:"), view);
    ((void (*)(id, SEL, id))objc_msgSend)(win, SL("makeKeyAndOrderFront:"), (id)0);
    ((void (*)(id, SEL, BOOL))objc_msgSend)(app, SL("activateIgnoringOtherApps:"), YES);

    id distant = call0(ocls("NSDate"), "distantFuture");
    for (;;) {
        id ev = ((id (*)(id, SEL, unsigned long long, id, id, BOOL))objc_msgSend)(
            app, SL("nextEventMatchingMask:untilDate:inMode:dequeue:"),
            ~0ULL, distant, (id)kCFRunLoopDefaultMode, YES);
        if (!ev) continue;
        unsigned long et = ((unsigned long (*)(id, SEL))objc_msgSend)(ev, SL("type"));
        if (et == EVENT_KEY_DOWN) {
            unsigned short kc = ((unsigned short (*)(id, SEL))objc_msgSend)(ev, SL("keyCode"));
            if (kc == KEY_CODE_ESCAPE) g_state = ST_CANCELLED;
        } else if (et == EVENT_MOUSE_DOWN) {
            CGRect before = g_sel;
            int had_before = g_have_sel;
            CGPoint p = ((CGPoint (*)(id, SEL))objc_msgSend)(ev, SL("locationInWindow"));
            g_start = p;
            g_sel = CGRectMake(p.x, p.y, 0, 0);
            g_have_sel = 1;
            redraw_selection(before, had_before);
        } else if (et == EVENT_MOUSE_DRAGGED) {
            CGRect before = g_sel;
            int had_before = g_have_sel;
            CGPoint p = ((CGPoint (*)(id, SEL))objc_msgSend)(ev, SL("locationInWindow"));
            double x = g_start.x < p.x ? g_start.x : p.x;
            double y = g_start.y < p.y ? g_start.y : p.y;
            g_sel = CGRectMake(x, y, fabs(p.x - g_start.x), fabs(p.y - g_start.y));
            redraw_selection(before, had_before);
        } else if (et == EVENT_MOUSE_UP) {
            if (g_have_sel && g_sel.size.width >= MIN_SELECTION_POINTS &&
                g_sel.size.height >= MIN_SELECTION_POINTS)
                g_state = ST_DONE;
            else
                g_state = ST_CANCELLED;
        }
        ((void (*)(id, SEL, id))objc_msgSend)(app, SL("sendEvent:"), ev);
        if (g_state != ST_ACTIVE) break;
    }
    ((void (*)(id, SEL, id))objc_msgSend)(win, SL("orderOut:"), (id)0);
    g_view = NULL;

    int rc = HARPY_CAPTURE_CANCELLED;
    if (g_state == ST_DONE) {
        CGImageRef selected = NULL;
        rc = crop_selection(&selected, max_long_edge_px, err, err_len);
        if (rc == HARPY_CAPTURE_OK) *out_image = selected;
    }

    CGImageRelease(g_full);
    g_full = NULL;
    call0(pool, "drain");
    return rc;
}

/* The second half of a shot. Safe off the main thread: a CGImage is immutable
   once created and ImageIO touches no AppKit state. The image is NOT released
   here — its owner is whoever called harpy_capture_region. */
int harpy_encode_capture(void *image, unsigned char **out_png, size_t *out_len,
                         char *err, size_t err_len) {
    if (!image) {
        set_error(err, err_len, "нечего кодировать");
        return HARPY_CAPTURE_FAILED;
    }
    return encode_png((CGImageRef)image, out_png, out_len, err, err_len);
}

void harpy_capture_release(void *image) {
    if (image) CGImageRelease((CGImageRef)image);
}

void harpy_capture_region_free(unsigned char *png) { free(png); }

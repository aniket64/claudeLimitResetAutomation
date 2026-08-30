#import <Cocoa/Cocoa.h>
#import <SafariServices/SafariServices.h>

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property (strong, nonatomic) NSWindow *window;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    NSRect frame = NSMakeRect(0, 0, 480, 260);
    NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable;
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:style
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window setTitle:@"Claude 5-Hour Reset Automation"];
    [self.window center];

    NSView *contentView = [[NSView alloc] initWithFrame:frame];
    [self.window setContentView:contentView];

    // App Title
    NSTextField *titleLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 190, 440, 36)];
    [titleLabel setStringValue:@"🤖 Claude 5-Hour Reset Automation"];
    [titleLabel setFont:[NSFont boldSystemFontOfSize:18]];
    [titleLabel setBezeled:NO];
    [titleLabel setDrawsBackground:NO];
    [titleLabel setEditable:NO];
    [titleLabel setSelectable:NO];
    [titleLabel setAlignment:NSTextAlignmentCenter];
    [contentView addSubview:titleLabel];

    // Subtitle / Status
    NSTextField *descLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(30, 100, 420, 80)];
    [descLabel setStringValue:@"The Safari Web Extension is installed and embedded in this application.\n\nTo enable or manage the extension, open Safari Settings → Extensions and check 'Claude 5-Hour Reset Automation'."];
    [descLabel setFont:[NSFont systemFontOfSize:13]];
    [descLabel setBezeled:NO];
    [descLabel setDrawsBackground:NO];
    [descLabel setEditable:NO];
    [descLabel setSelectable:NO];
    [descLabel setAlignment:NSTextAlignmentCenter];
    [contentView addSubview:descLabel];

    // Open Safari Extensions Button
    NSButton *openButton = [[NSButton alloc] initWithFrame:NSMakeRect(120, 35, 240, 40)];
    [openButton setTitle:@"Open Safari Extensions Settings"];
    [openButton setBezelStyle:NSBezelStyleRounded];
    [openButton setTarget:self];
    [openButton setAction:@selector(openSafariExtensions:)];
    [contentView addSubview:openButton];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)openSafariExtensions:(id)sender {
    [SFSafariApplication showPreferencesForExtensionWithIdentifier:@"com.aniket.ClaudeResetAutomation.Extension" completionHandler:^(NSError * _Nullable error) {
        if (error) {
            NSLog(@"[ClaudeResetAutomation] Error opening Safari preferences: %@", error);
        }
    }];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        [app setDelegate:delegate];
        [app run];
    }
    return 0;
}

#import <Foundation/Foundation.h>
#import <SafariServices/SafariServices.h>

extern int NSExtensionMain(int argc, const char *argv[]);

@interface SafariWebExtensionHandler : NSObject <NSExtensionRequestHandling>
@end

@implementation SafariWebExtensionHandler

- (void)beginRequestWithExtensionContext:(NSExtensionContext *)context {
    NSExtensionItem *response = [[NSExtensionItem alloc] init];
    response.userInfo = @{ @"status": @"ok" };
    [context completeRequestReturningItems:@[response] completionHandler:nil];
}

@end

int main(int argc, const char *argv[]) {
    return NSExtensionMain(argc, argv);
}

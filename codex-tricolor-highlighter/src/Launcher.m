#import <Cocoa/Cocoa.h>
#import <spawn.h>
#import <fcntl.h>
#import <sys/wait.h>
#import <signal.h>
#import <poll.h>
extern char **environ;

static void notice(NSString *title, NSString *detail) {
    NSAlert *a=[NSAlert new]; a.messageText=title; a.informativeText=detail;
    [NSApp activateIgnoringOtherApps:YES]; [a runModal];
}
static BOOL writeAll(int fd, NSData *data) {
    const char *p=data.bytes; size_t count=data.length;
    while(count){ssize_t n=write(fd,p,count);if(n<0 && errno==EINTR)continue;
        if(n<=0)return NO;p+=n;count-=(size_t)n;}return YES;
}
static int childEnd(int fd){return fcntl(fd,F_DUPFD_CLOEXEC,10);}
int main(void) { @autoreleasepool {
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSString *bundleID=@"com.openai.codex";
    NSURL *bundle=[[NSWorkspace sharedWorkspace] URLForApplicationWithBundleIdentifier:bundleID];
    NSBundle *client=bundle?[NSBundle bundleWithURL:bundle]:nil;
    if(![client.bundleIdentifier isEqual:bundleID]||!client.executablePath){
        notice(@"找不到桌面客户端",@"请先安装 ChatGPT 桌面版。");return 1;
    }
    if([NSRunningApplication runningApplicationsWithBundleIdentifier:bundleID].count){
        NSAlert *a=[NSAlert new];a.messageText=@"等你退出聊天后启用荧光笔";
        a.informativeText=@"点「等待退出」，看完当前聊天后按 ⌘Q 正常退出 ChatGPT。荧光笔会自动重新打开它。";
        [a addButtonWithTitle:@"等待退出"];[a addButtonWithTitle:@"取消"];
        [NSApp activateIgnoringOtherApps:YES];if([a runModal]!=NSAlertFirstButtonReturn)return 0;
        while([NSRunningApplication runningApplicationsWithBundleIdentifier:bundleID].count){
            @autoreleasepool{[[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.5]];}
        }
    }
    NSString *script=[NSString stringWithContentsOfURL:[[NSBundle mainBundle] URLForResource:@"pen" withExtension:@"js"] encoding:NSUTF8StringEncoding error:nil];
    if(!script.length){notice(@"荧光笔文件不完整",@"请重新解压应用。");return 1;}
    int in[2],out[2]; if(pipe(in)||pipe(out))return 1;
    int rd=childEnd(in[0]), wr=childEnd(out[1]);
    if(rd<0||wr<0)return 1;
    posix_spawn_file_actions_t actions;posix_spawn_file_actions_init(&actions);
    for(int i=0;i<2;i++){posix_spawn_file_actions_addclose(&actions,in[i]);posix_spawn_file_actions_addclose(&actions,out[i]);}
    posix_spawn_file_actions_adddup2(&actions,rd,3);posix_spawn_file_actions_adddup2(&actions,wr,4);
    posix_spawn_file_actions_addclose(&actions,rd);posix_spawn_file_actions_addclose(&actions,wr);
    const char *exe=client.executablePath.fileSystemRepresentation;
    char *args[]={(char*)exe,"--remote-debugging-pipe",NULL};pid_t pid;
    int err=posix_spawn(&pid,exe,&actions,NULL,args,environ);
    posix_spawn_file_actions_destroy(&actions);close(rd);close(wr);close(in[0]);close(out[1]);
    if(err){notice(@"桌面客户端启动失败",[NSString stringWithUTF8String:strerror(err)]);return 1;}
    signal(SIGPIPE,SIG_IGN);
    const int commandFD=in[1]; __block NSInteger seq=0;
    NSNumber *(^send)(NSString*,NSDictionary*,NSString*)=^NSNumber *(NSString *method,NSDictionary *params,NSString *session){
        NSNumber *i=@(++seq);NSMutableDictionary *msg=[@{@"id":i,@"method":method,@"params":params} mutableCopy];
        if(session)msg[@"sessionId"]=session;
        NSMutableData *bytes=[[NSJSONSerialization dataWithJSONObject:msg options:0 error:nil] mutableCopy];
        char zero=0;[bytes appendBytes:&zero length:1];return writeAll(commandFD,bytes)?i:nil;
    };
    NSMutableDictionary *pending=[NSMutableDictionary new];
    NSMutableSet *attached=[NSMutableSet new];NSMutableData *buf=[NSMutableData new];
    send(@"Target.setDiscoverTargets",@{@"discover":@YES},nil);
    BOOL installed=NO;NSDate *began=[NSDate date];BOOL warned=NO;
    while(1){@autoreleasepool{
        struct pollfd pfd={out[0],POLLIN,0};int ready=poll(&pfd,1,1000);
        if(!installed&&!warned && -began.timeIntervalSinceNow>25){
            warned=YES;notice(@"荧光笔尚未连接",@"客户端仍可正常使用。请打开一个聊天。如果选中文字后始终没有三色按钮，这个版本可能没有启用荧光笔所需的桌面接口。");
        }
        if(ready<0&&errno==EINTR)continue;if(ready<0)break;if(!ready)continue;
        char chunk[32768];ssize_t n=read(out[0],chunk,sizeof(chunk));if(n<=0)break;
        [buf appendBytes:chunk length:(NSUInteger)n];
        while(buf.length){const char *zero=memchr(buf.bytes,0,buf.length);if(!zero)break;
            NSUInteger len=(NSUInteger)(zero-(const char*)buf.bytes);
            NSDictionary *msg=[NSJSONSerialization JSONObjectWithData:[buf subdataWithRange:NSMakeRange(0,len)] options:0 error:nil];
            [buf replaceBytesInRange:NSMakeRange(0,len+1) withBytes:NULL length:0];if(![msg isKindOfClass:NSDictionary.class])continue;
            NSDictionary *p=msg[@"params"];NSString *method=msg[@"method"];NSDictionary *t=p[@"targetInfo"];
            if([method isEqual:@"Target.targetCreated"]||[method isEqual:@"Target.targetInfoChanged"]){
                NSURL *url=[NSURL URLWithString:t[@"url"]?:@""];
                NSString *target=t[@"targetId"];
                if([t[@"type"] isEqual:@"page"]&&[url.scheme isEqual:@"app"]&&[url.host isEqual:@"-"]&&target&&![attached containsObject:target]){
                    [attached addObject:target];NSNumber *i=send(@"Target.attachToTarget",@{@"targetId":target,@"flatten":@YES},nil);
                    if(i)pending[i]=target;
                }
            }else if([method isEqual:@"Target.targetDestroyed"]&&p[@"targetId"]){[attached removeObject:p[@"targetId"]];}
            NSNumber *i=msg[@"id"]; if(!i)continue;NSString *tag=pending[i];if(!tag)continue;
            [pending removeObjectForKey:i];
            if([tag isEqual:@"installed"]){if(msg[@"result"][@"identifier"])installed=YES;continue;}
            NSString *session=msg[@"result"][@"sessionId"];if(!session){[attached removeObject:tag];continue;}
            NSNumber *next=send(@"Page.addScriptToEvaluateOnNewDocument",@{@"source":script,@"worldName":@"mac-tricolor-reader",@"runImmediately":@YES},session);
            if(next)pending[next]=@"installed";
        }
    }}
    close(in[1]);close(out[0]);if(!installed&&!warned)notice(@"本次未连接到聊天窗口",@"若桌面客户端已经打开，请正常退出后再启动荧光笔。");
    return 0;
}}

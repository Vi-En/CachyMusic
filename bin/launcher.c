#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <libgen.h>
#include <limits.h>

static pid_t g_php_pid = 0;
static pid_t g_browser_pid = 0;

static void handle_exit(int sig) {
    (void)sig;
    if (g_php_pid > 0) {
        kill(g_php_pid, SIGTERM);
    }
    _exit(0);
}

static int is_port_listening(int port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return 0;
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    int res = connect(sock, (struct sockaddr*)&addr, sizeof(addr));
    close(sock);
    return (res == 0);
}

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;
    signal(SIGINT, handle_exit);
    signal(SIGTERM, handle_exit);
    signal(SIGHUP, handle_exit);

    char exe_path[PATH_MAX];
    ssize_t len = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
    if (len == -1) {
        perror("readlink");
        return 1;
    }
    exe_path[len] = '\0';

    char *app_dir = dirname(strdup(exe_path));
    // If inside a bin/ folder, go one level up
    char *base = basename(strdup(app_dir));
    if (strcmp(base, "bin") == 0) {
        app_dir = dirname(strdup(app_dir));
    }

    if (chdir(app_dir) != 0) {
        perror("chdir");
        return 1;
    }

    int port = 8000;
    if (!is_port_listening(port)) {
        pid_t pid = fork();
        if (pid == 0) {
            // Child: run PHP server
            setsid();
            char port_str[16];
            snprintf(port_str, sizeof(port_str), "127.0.0.1:%d", port);
            setenv("PHP_CLI_SERVER_WORKERS", "8", 1);
            freopen("/dev/null", "r", stdin);
            freopen("/dev/null", "w", stdout);
            freopen("/dev/null", "w", stderr);
            execlp("php", "php", "-S", port_str, "index.php", (char*)NULL);
            _exit(1);
        } else if (pid > 0) {
            g_php_pid = pid;
            for (int i = 0; i < 30; i++) {
                usleep(100000);
                if (is_port_listening(port)) break;
            }
        }
    }

    char url[64];
    snprintf(url, sizeof(url), "http://127.0.0.1:%d", port);
    char app_arg[128];
    snprintf(app_arg, sizeof(app_arg), "--app=%s", url);

    const char *home = getenv("HOME");
    char profile_dir[PATH_MAX];
    snprintf(profile_dir, sizeof(profile_dir), "--user-data-dir=%s/.config/cachymusic", home ? home : "/tmp");

    const char *browsers[] = {
        "brave", "brave-browser", "google-chrome", "google-chrome-stable",
        "chromium", "chromium-browser", "microsoft-edge", "firefox", "xdg-open", NULL
    };

    const char *found_browser = NULL;
    for (int i = 0; browsers[i] != NULL; i++) {
        char check_cmd[128];
        snprintf(check_cmd, sizeof(check_cmd), "command -v %s >/dev/null 2>&1", browsers[i]);
        if (system(check_cmd) == 0) {
            found_browser = browsers[i];
            break;
        }
    }

    if (!found_browser) {
        fprintf(stderr, "No suitable browser found. CachyMusic is running at %s\n", url);
        while (1) sleep(1);
        return 0;
    }

    pid_t bpid = fork();
    if (bpid == 0) {
        if (strcmp(found_browser, "firefox") == 0) {
            execlp(found_browser, found_browser, "--new-window", url, (char*)NULL);
        } else if (strcmp(found_browser, "xdg-open") == 0) {
            execlp(found_browser, found_browser, url, (char*)NULL);
        } else {
            execlp(found_browser, found_browser, app_arg, profile_dir, "--class=cachymusic", (char*)NULL);
        }
        _exit(1);
    } else if (bpid > 0) {
        g_browser_pid = bpid;
        int status;
        waitpid(bpid, &status, 0);
    }

    handle_exit(0);
    return 0;
}


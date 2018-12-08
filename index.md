<!-- Insert SpaceCraft logo either above, below, or next to title -->
# SpaceCraft: A Real-Time, Collaborative REPL

# 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node.js and Docker, with the a client-server network architecture that communicates over WebSockets.

SpaceCraft serves as a tool for developers to easily experiment with a programming language, while eliminating the burden of downloading and configuring the languages on their local machine. Furthermore, SpaceCraft makes pair-programming easy between interviewers and candidates, or with a small team of developers who want to share their experiences with a programming language.

The major challenges we faced were creating and managing server-side processes for executing code in the selected language runtime, allowing multiple clients to collaborate on the same REPL, and building a framework for security and resource usage with Docker containers.

In this case study, we'll detail our journey in building this project, the strategies we employed to synchronize collaborating clients in real-time, the security techniques we implemented to prevent malicious code, and our network architecture. We'll explore the choices we made to efficiently transfer user input and evaluated output between the clients and server, reduce our latency, and balance our resource usage across all our containers.

## 1.1 High-Level Goals
SpaceCraft's goals on the surface are simple. We provide users with a choice of languages to code in and present both a terminal-like REPL and editor for them to write and evaluate their code. A user can also invite other users to join their session to collaborate on writing code in both the editor and REPL. Thus, when one user writes code or submits it for evaluation, all collaborating users will see the same output on their respective screens in real-time.

However, there is a danger in providing users with a terminal-like REPL that directly connects to our back-end for code execution. This design opens the door for malicious code to be input by users directly into our system, making us vulnerable to a host of exploits. Therefore, in order to protect our application and users we need to:
- Isolate each user's session from the sessions of other users (non-collaborating users.)
- Prevent any malicious code from affecting our system.
- Manage the usage of our server's resources for each session so that one user's code doesn't affect other users.

# 2 Network Architecture

## 2.1 Client-server Architecture
Our application operates with a client-server architecture in which users connect to the server and start up a REPL session. Additionally, users who wish to collaborate can connect to the same REPL session and sync their input & output. We initially started with using HTTP to have clients communicate with our server, and quickly discovered some issues with this approach:
- There is no way for our server to automatically detect a client disconnection. The server would need to send an HTTP request to ping the client and determine if a disconnection has occurred.
- There is a significant amount of overhead (~200 MB) with each HTTP request/response which adds up over time with multiple users collaborating in the same session.
- This overhead also adds up in the case of single users since our application sends a request to the server with each keypress as the user write code as part of our design to sync collaborating users.

To address these problems, we needed an alternative that could provide bidirectional communication between a client and server, that could also detect client disconnections and have a smaller overhead. The best solution that we found was WebSockets.

## 2.2 WebSockets
We used the popular library [Socket.io](https://socket.io/) to leverage WebSockets in SpaceCraft. The major benefit of using WebSockets is that it provides a bidirectional communication between the client and server over a single TCP connection. After an inital HTTP handshake to establish the TCP connection, our client and server will then be connected through WebSockets. This ensures that either the client or server can send information to each other when needed with an overhead of only ~10 MB. This is a ~95% decrease from using HTTP!

Additionally, since the TCP connection over WebSockets remains open until either the client or server disconnects we can easily know when a user disconnects from out application. This enables us to efficiently begin the container teardown process and free up resources for new users. Finally, WebSockets allows us to maintain 1024 or more connections per server as opposed to ~6 connections per server with HTTP. This enables us to scale our application more efficiently as our user base grows.

# 3 Building a REPL
Our first task was to create a version of SpaceCraft that services a single user per session. This version would allow the user to:
- Select from a list of supported languages.
- Write code in the REPL, submit for evaluation by hitting Enter, and receive the result as output.
- Write code in the editor, submit for evaluation by clicking a Run button, and receive the result as output.
- Store state in the client, such as the current line of input for evaluation and the current language for UI display.

In SpaceCraft, a user makes a language selection from a drop-down menu which will automatically update the REPL to their chosen language's runtime. They can then write code directly into the REPL for evaluation or into an embedded editor for writing larger programs.

When code is submitted for evaluation, our app takes the code as input and sends it to our server for evaluation. Once this is complete, our server sends the result as output to the client, which is displayed in the user's REPL.

## 3.1 Creating the User Interface


SpaceCraft's user interface was created with [Xterm.js](https://github.com/xtermjs/xterm.js/) and [CodeMirror](https://codemirror.net/). Xterm is a terminal front-end component written in JavaScript that creates an emulated terminal for our REPL in which users can write their code and submit for evaluation. When a user hits Enter in the RPL, we submit their code as input to our server for evaluation, and the result is then sent back to be displayed in the REPL.

CodeMirror is a versatile text editor implemented in JavaScript for the browser. It's specialized for writing and editing code and provides a familiar text editor experiences for developers. By leveraging Xterm.js and CodeMirror to create our user interface and receive input, our team was able to focus our efforts on developing a rich REPL experience for Ruby, JavaScript, and Python, along with a secure framework for handling malicious user input. So how exactly did we handle a user's input and properly evaluate it on our backend? Let's dive in to see!

## 3.2 Interacting with the REPL program on the Back-end
Since we provide users with the ability to submit code remotely for server-side evaluation, we have to simulate the entire REPL experience ourselves. This is fundamentally different from the regular experience with a REPL program, such as when a user inputs directly into an interactive REPL console.

That being said, the interaction between the user and the underlying REPL program will have to be manually set-up through our application logic. Our application must be able to send inputs to the REPL program and read any outputs after an evaluation is completed. The complexity potentially increases as we deal with the REPL programs for different languages.

![simulate-repl](https://i.imgur.com/Yka7qQO.png)

We will explore three different approaches which can help in simulating a REPL to the user.

### Approach #1: Interact with the language’s built-in REPL API library
Many languages provide APIs to access and interact with its native REPL program. Node.js for example, provides the `repl` module that allows developers to work directly with its API from within the application code. 

The problem with using language-specific APIs, however, is that we would have to write and run the application code in that language's runtime. For each additional language supported, we would need to re-write the same logic in that language. The complexity increases exponentially with each additional supported language.

Thus, our goal of supporting three languages, and potentially more in the future, does not benefit from this approach.

### Approach #2: Spawning a REPL Child Process and Interacting Directly with It
We could also make use of APIs that enable us to access the standard streams of a REPL child process. In particular, we are going to access the standard input (a writable stream) as well as the standard output (a readable stream) of the REPL child process. More info on working with streams can be found here: [Node.js Streams](https://medium.freecodecamp.org/node-js-streams-everything-you-need-to-know-c9141306be93#4fc8).

We can naively think that writing into the standard input would produce a desired output. However, the output may hang. To demonstrate this, we have a recorded live-coding of accessing standard streams of a REPL process:

![demo-hanging-outputs](https://i.imgur.com/3oHdW1S.gif)
> *Notice that the output hangs while `stdin` is left open*
> *IRB produces a full output, while Node.js and Python do not*

We'll explore the two possible reasons as to why this may occur.

Streams may be blocked when we try to read from the standard output. One problem is that the standard input may not send any data to the REPL process for evaluation until the input stream is closed. [Why is it necessary to close standard streams](https://stackoverflow.com/questions/9818534/why-is-it-necessary-to-close-standard-input-output-error-when-writing-a-daemon)

Interpreted languages are written in lower-level languages, and due to how the language interacts with the standard stream, it may be a cause of hanging outputs. For example, the C implementation of `read()` [function](https://linux.die.net/man/3/read) would hang when we try to read from an output stream, until new data is being written to the corresponding input stream.

Although there are [techniques](http://eyalarubas.com/python-subproc-nonblock.html) to unblock the processes for reading or writing from the streams, the techniques are not universal on all languages. If we were to implement various techniques to get around this issue, our application's code complexity would increase significantly. Thus, this does not fit our use case.

### Approach #3 Interacting with a Pseudo-terminal
A pseudo-terminal is a program that appears to be a terminal to another program. With this, it provides a communication channel between our application code and the underlying REPL program.

<!-- The-Linux-programming-interface-a-Linux-and-UNIX-system-programming-handbook.pdf -->

This is useful since we can easily persuade our REPL program that its input is coming from a terminal, so that we can standardize the way different REPLs are connected to our application code.

Our goal is to go from here:
> **Regular user interaction with a REPL**

![regular-interaction](https://i.imgur.com/Qoke9qU.png)

To here.
> **Simulated interaction with a REPL through application and pseudo-terminal**

![simulated-interaction](https://i.imgur.com/BUVSyvZ.png)

By leveraging a pseudo-terminal, we can:
- offload burdern of managing input and output streams of different REPL runtimes
- allow sending of control sequences (such as Ctrl-C) to the REPL for signal to interrupt
- capture full outputs from the REPL program, including colored outputs

To demonstrate the advantages mentioned above, we have also made a recording of a coding example that illustrates the interaction with a pseudo-terminal through the use of `node-pty` library:

![pty-demo](https://i.imgur.com/WdwfYGF.gif)
> *Notice that REPLs produce full outputs regardless of chosen runtime, and that colored outputs and prompts are displayed, too*

With these advantages mentioned, we can further reduce our code complexity and increase the extensibility of adding new languages, due to a standardized way of handling inputs and outputs.

The trade-off of using a pseudo-terminal is that there is a slight increase in overhead as we are adding an additional processing layer in between our application and the underlying REPL child process. However, with all the benefits mentioned, this approach fits our use case.

# 4 Collaboration with Multiple Users
Now we have built our REPL on the back-end, we need a way to synchronize REPL states across clients for real-time collaboration. There are two main components which we need to synchronize: the current line of REPL input as well as the output display on the front-end REPL terminal.

While it is possible to utilize external libraries to manage the synchronization of inputs and outputs for us, we chose to build this feature ourselves from scratch. Our reasoning is so that we can:
- easily add new features that are not supported from the library, such as handling output overflow during an infinite loop
- know what is going on under-the-hood so that we can more easily optimize the flow of input/outputs to reduce latency

## 4.2 Syncing Output
The flow of output synchronization works as follows: 
1. Client requests a line of code to be evaluated

<!-- ![Imgur](https://i.imgur.com/B7Npcr7.png) -->

2. Application server receives line of code
3. Application server sends the line of code to the pseudo-terminal, which is connected to the REPL program

<!-- ![app to pty](https://i.imgur.com/vrITjNw.png) -->

5. Application server reads evaluation result from the pseudo-terminal in the form of chunks of output data

<!-- ![Imgur](https://i.imgur.com/W0TydOE.png) -->

7. Application server broadcasts to all connected clients by streaming the output chunks to them

<!-- ![Imgur](https://i.imgur.com/aAXCrmP.png) -->

8. Clients receive the outputs and display them on the front-end terminal.

## 4.3 Syncing Input
To demonstrate input synchronization, we will make use of an example as follows:
1. The current REPL input line is empty
2. User enters a character `[` into the repl terminal

3. The user's client state is updated to `{ line: '[' }`, at the same time, `[` is written into the front-end terminal

```javascript
handleKeypress (key) {
  state.line += key
  term.write(key)
  this.emitLineChanged()
}
```

4. The user's client emits an event to the application server indicating that the current line is changed

```javascript
emitLineChanged () {
  socket.emit('lineChanged', { line: state.line })
},
```

5. Application server broadcasts the updated current line to all other connected clients

```javascript
socket.on('lineChanged', ({ line }) => {
  socket.broadcast.emit('syncLine', { line })  
})
```

6. All other connected clients update their state to `{ line: '[' }` and the chracter is written into the front-end terminal.

```javascript
socket.on('syncLine', ({ line }) => {
  state.line = line
  resetTermLine()
  term.write(line)
})
```

## 4.4 Handling Conflicts in Shared Editing
Giving users the option to collaborate in real-time means that potential conflicts would happen if multiple users type at the same time. This may occur if our server receives updates at a different order than they were sent. When conflicts happen, both clients [may not converge](https://conclave-team.github.io/conclave-site/#what-is-a-real-time-collaborative-text-editor]) to the same state. 

For example, when a user inserts a character at position index 0 and another user deletes at the same position, and both operations happen at the same time, we need to resolve any conflicts so that both clients will arrive at the same state.

### Conflict Resolution in REPL terminal
In our REPL terminal, we rely on [eventual consistency](https://en.wikipedia.org/wiki/Eventual_consistency) to resolve conflicts. This means that if both clients happen to type on the REPL terminal at the same time, the last update that is received by our application will take precedence. This is also known as "last write wins".

We chose not to employ any Operational Transformation or Conflict-free Replicated Data Type (CRDT) techniques for resolving potential conflicts in our REPL terminal input, due to unnecessary code complexity as well as additional server overhead. Our reasoning is that we expect users to take turns instead of competing against each another when evaluating inputs in our REPL.

### Conflict Resolution in Text Editor
Since we also have a text editor component where users can collaborate at the same time, there is higher likelihood that a conflict will occur. We can reasonably expect that both users will type at the same time, and if they happen to type into each other's code by accident, we would like to make sure that their operations are:
- commutative: concurrent insertion converge to the same result, regardless of order in which they are applied
- indempotent: duplicated delete operations are only applied once to produce the same result

> Source: [Conclave: A Real-Time Collaborative Text Editor](https://conclave-team.github.io/conclave-site/)

To solve this issue, we utilized Yjs, a shared editing framework that utilizes an optimized CRDT for conflict resolution. We also chose Yjs because of its WebSockets adapter that integrates nicely into our application.

However, the trade-off of utilizing Yjs is that it increases memory consumption on the server-side. We believe that it is due to the caching of replicated data structures that are required for CRDTs to work. Nonetheless, we chose to use it since it provides a low-latency collaborative environment for our users.

## 5 Utilizing Containers
At this point, we've succeeded in taking a user's code and evaluating it in a language runtime. However, with this achievement comes new problems that we need to solve. Since we are connecting users with a pseudo-terminal that executes on our server, we leave ourselves and our users open to the risk of a user submitting malicious code directly to our backend. In order to prevent this situation, we need to isolate each user's session, and thereby isolate their code, within our application. With this isolation comes several challenges:
- How do we provide each user with an isolated, complete copy of our application to evaluate their code?
- How do we handle any malicious code submitted by the user, which may be able to break out of isolation?
- How do we manage our backend computing resources for isolated user so that one user's code evaluation doesn't rob resources from another user?
- How do we enable multiple users to collaborate in the same isolated enviornment?

To address these challenges, we chose to implement containers. Through containers, we are able to provide an isolated, complete copy of our application to each user while enabling us to set security and resource management measures on each container. With this approach, we can effectively separate users from each other, contain malicious code, and ensure that one container only uses a set amount of resources. Let's start with how we segment users by container.

## 5.1 Segmenting Users by Container
The core idea behind containers is that you create a single unit of software that is encapsulated and can be deployed anywhere. By putting your software and dependencies in a container and operating within in, we can effectively deploy our container on any system without worrying about the host system configurations. In addition, containers provide a level of isolation from the rest of the system that enable security measures to be placed to prevent the software in a container from affecting the rest of the system and other users' sessions.

<!-- Docker logo -->

To start, we used Docker to create our containers which will each hold an entire copy of our application code. Containers are created using an image file, which provides the details of all the software and dependencies that should be included in the container. Once we need to instantiate a new container, we simply execute a run command that instantiates a container using the image file as a blueprint.

Thus, our new user workflow is as follows:
1. a new user makes a request to our application.
2. when our server receives the request, a new container is created based on the image file.
3. the server then forwards the user's request to the container.
4. the user is then taken to the container which serves as their "room" and they can begin coding away with our REPL.

With this design, each user is given their own isolated environment to write and evaluate their code. If any user attempts to submit malicious code to destroy our application, they will only be affecting their copy of our application code within the container and our host system is unaffected.

However, this is only a start as there are ways for users to break out of their containers and we need to add some more security measures. Also, at this point each container can draw upon all of the host server's resources to evaluate the user's code. This is not ideal since one user's code could be more computationally intensive and consume more CPU and memory resources away from other users, thereby worsening their session's performance. Let's see how we can fix this!

## 5.2 Securing Containers
The main issue of security within containers is when users are given root access, which is actually the default setting with Docker. This allows users to have complete access to the files within the container and the ability to do some truly malicious activity. 

### Remove Root-level Access
The first step to securing our container is to remove the default root-level access and prevent users from being able to execute harmful commands such as `rm -rf /` in our application.

To achieve this, we can simply create a user with restricted permissions that will run as the default profile for any user in our container. The restrictions include making them a non-root user and creating a special `bin` folder from which they access their terminal commands. This special `bin` folder will have a limited number of commands for use and will not include commands such as `touch`, `mkdir`, `rm`, and so on.

### Strengthen Isolation with Container Runtime Sandbox
While containers provide some isolation between our host system and application, containers [are not inherently a sandbox](https://cloud.google.com/blog/products/gcp/open-sourcing-gvisor-a-sandboxed-container-runtime). Applications that run in containers access system resources in the same way that non-containerized applications do, which is by making privileged system calls directly to the host kernel. What this means is that container escape is still possible with a successful privilege escalation attack. An example would be the [Dirty Cow](https://en.wikipedia.org/wiki/Dirty_COW) (copy-on-write) vulnerability that gives attackers write access to a read-only file, essentially giving them access to root.

> Our current container architecture. Docker alone provides weak isolation, where all system calls made by our application are accepted by the host kernel

![weak isolation](https://i.imgur.com/QdXUTH3.png)

While we can run containers within a virtual machine to provide strong isolation from the host system, it also means a larger resource footprint (gigabytes of disk space) and slower start-up times.

A container runtime sandbox provides similar level of isolation with virtual machines while minimizing resource footprint. A runtime sandbox achieves this by intercepting application system calls and acts as the guest kernel. On top of that, it also employs rule-based execution to limit the application's access of resources. With this, any attempted privilege system calls will be intercepted, before it has a chance to reach our host system.

We chose to leverage gVisor, an open-sourced container runtime sandbox developed by Google, because it provides the security benefits mentioned above and integrates well with Docker.

> Unprivileged access is enforced through the use of a container sandbox runtime, which provides a much stronger isolation between our application and the host kernel

![givsor strong isolation](https://i.imgur.com/3PUBSki.png)

The trade-offs of using such a container runtime sandbox however, are reduced application compatibility and a higher per-system call overhead. Nevertheless, our application functions properly and there is no noticeable difference in performance even with gVisor enabled. Thus, using gVisor fits our use case.

With these measures in place, we have effectively made a user profile that is incapable of accessing or changing the files in the container, along with making it a lot harder for users to submit malicious code.

## 5.3 Managing Container Resources
Now that we've tackled the security issues of using containers, we need to turn our attention to managing the container's resources. By default, each container is able to consume the entire CPU and memory of their host server to complete their processes. While this makes sense at a high level as you want each container to have sufficient resources to complete their work, it becomes a liability when a user submits code for evaluation that is computationally intensive.

For example, a user in one container may write a program that requires a large amount of mathematical calculations, string processing, or infinite loops that cause a spike in CPU usage which causes a drop in performance for other containers. Or a user may input large amounts of data into the text editor that eat away at the available memory in our host server and leave little remaining for other users. To combat these issues and ensure that each container only uses a reasonable amount of resources, we can use Docker's cgroups (control groups) to place a resource limit on each contaier.

At it's core, a cgroup is simply a limitation placed on an application or container to a specific set of resources. By specifying this limitation when creating a container, we can easily set the max CPU or memory allowed for use by a container. So if we want to spin up a container that can only use 20% of our total CPU and 100MBs of our total memory, all we need to do is include ` --memory=100m -it --cpus=".2"` within our `docker run` command. And just like that, we've handled any potential hogging of resources by a single container and ensured stable performance across the board for our users.

# 6 Optimizations

## 6.1 Streaming vs. Buffering Outputs
A REPL program sends outputs in the form of chunks of data. For each evaluation, our application would receive several to many smaller chunks of output data.

To demonstrate this, let's evaluate the code `[1,2,3].map(String)` on the Node.js REPL. We can reasonably expect the final output to be:

```
> [1,2,3].map(String)
[ '1', '2', '3' ]
>
```

However, since we are writing and reading data directly to and from a pseudo-terminal, the evaluation result is written out through the standard output (a readable stream). This means that the first chunk of data available to be read from the readable stream may not contain our full output.

In fact, the chunks of output data from the same example above may look something like this:

```
[1      # first chunk of data
,2,3].  # second chunk of data
map     # third chunk and so on...
(St
ri
ng
)
\r\n
[ '1', '2', '3' ]\r\n
>       # final chunk of data
```

### Buffering Outputs
With this effect, it makes sense to concatenate all chunks before sending it as a complete response. This is known as [output buffering](http://web.archive.org/web/20101216035343/http://dev-tips.com/featured/output-buffering-for-web-developers-a-beginners-guide).

After buffering output, it would look something like:

```
[1,2,3].map(String)\r\n[ '1', '2', '3' ]\r\n> 
```

The advantage to this in our use case is that we can easily parse out the current prompt depending on the current runtime (`>` for Node.js, `irb(main):XXX:0>` for Ruby and `>>>` for Python) on the client-side. The prompt is useful for re-writing the entire terminal line when syncing with other clients.

However, buffering outputs cost additional processing time. Since chunks of data arrive in different intervals (around 1-4 ms in between), we would set a maximum wait time of 5 ms every time a new data chunk is received. If no new data is received within the 5 ms, we conclude that the output is finished and we can send the complete buffered output to the client.

### Streaming Outputs
Our initial approach of buffering outputs seem to work fine. However, we found out that we could parse out the prompt on the server-side instead by caching the last chunk of data received. An example data chunk would be `=> 123\r\nirb(main):003:0> `, by caching this data chunk, we can easily parse out the `irb(main):003:0> ` prompt.
With this, it is no longer necessary to buffer outputs. Instead, we could stream the outputs as-is to the client. The benefit of this is that it not only removes any additional processing, but also simplifies our code logic by avoiding any use of `setTimeouts` or `setIntervals`.

With these two approaches in mind, we decided to run some benchmarking to confirm that streaming is the better approach. We utilized Artillery, a load testing toolkit to measure the performance of both approaches.

Our benchmarking set-up involves connecting 20 virtual users one at a time to our server, with each submitting 5 evaluation requests, thereby totaling 100 requests per test.

The results clearly show that the streaming approach is the winner:

| Server Location  |  Median Latency with Buffering Enabled (ms)  | Median Latency without Buffering (ms) | Difference |
| --- | --- | --- | --- |
| localhost |  12.3 | 2.1 | 10.2 |
| remote, near (NYC to NYC) | 21.3 |  15.2 | 6.1 |
| remote, far (NYC to SF) | 89.3 | 78.9 | 10.4 |

Our goal here is to minimize the latency to maintain a real-time experience for users, and while a 10 ms improvement in latency may not seem like a huge difference, it nevertheless represents more than 10% of the total latency time for connections within the U.S. Therefore, it makes sense to stream outputs instead of buffering outputs.

# 7 Connecting Users to Containers
At this point, we've successfully built our collaborative REPL and isolated complete instances of our application in containers. Now, we need to evaluate how we can connect clients to their associated container on the server, as well as allowing a user toinvite other users to collaborate in their "room".

## 7.1 Port Forwarding
Currently, each container on our server will have an IP address and port number associated with it. The naive approach that we've started with is to use port forwarding, which takes the inital HTTP request from the client and forwards it to the address and port number of a ready-to-use container.

This technique is simple since it's a direct mapping of the client to the container destination. However, this technique is flawed by being a security risk since the port numbers are pre-determined. By running a port scanner to probe for open ports, any user could access any room. This leads to a complete lack of privacy for our users who wish to collaborate only with the people they invite to join their room.

We need a better approach that can protect our users' privacy and mask the connections to our containers. Thankfully, this can be achieved with a reverse proxy.

## 7.2 Solution: A Reverse Proxy
The idea behind a reverse proxy is that there is some middleware that sits between your clients and your server which acts as an intermediary between the two. When a client sends an HTTP request to the server, a reverse proxy will receive that request and communicate with the server for the necessary information. The server will respond to the reverse proxy, which will then forward the server response to the client.

![reverse proxy](https://imgur.com/eIBtN6g.png)

While this may sound like a roundabout way of handling a requst and response, the benefit is that we can abstract away the connection of addresses and ports to ensure the privacy of our rooms. From the client's persepective, they are connected to the appropriate container and doesn't know its exact IP address or port number of our host. 

Furthermore, our proxy server can be made responsible to assign random URLs to created rooms, thereby preventing other users from gaining access through port sniffing or through guessing pre-determined URLs. We will detail how this works in the following section.

In our application, the reverse proxy will handle the inital HTTP handshake that is needed to connect a user with a container, and create the WebSockets connection between the two. Once this is done, the user can send input and receive output with the container through WebSockets alone and the reverse proxy is no longer needed for continued communication.

![websockets](https://i.imgur.com/rjdOm1W.png)

Along with solving our privacy concerns, a reverse proxy provides us our application with greater scalability as our user base grows. It can serve as a load balancer as we add more servers and it can provide content caching to reduce latency for particular content outside of establishing the client-container connection.

## 7.3 Session Management
In order for us to handle multiple rooms for different groups of users, we make use of our reverse proxy server to also handle the tasks of:
- initializing a session (create a room)
- forwarding requests to the appropriate container
- destroying a session

To customize a reverse proxy to fit our use case, We built our reverse proxy from scratch using VanillaJS, along with a few essential libraries to help us get started.

### 7.3.1 Session Initialization
To initialize a session, we need to:
1. generate a unique URL for every session created
2. instantiate a container to start an instance of our application
3. map the generated URL to the newly created container's private IP and port number

#### Generating Unique URL
The basic idea behind preventing users from being able to guess a URL is by generating it using a sufficiently large number generator. For this, we utilized a UUID generator to generate our session ID. At our current scale, the first 6 digits of the UUID is sufficient, as it already provides 16,777,216 possibilities.

#### Path-based URL forwarding

The initial approach is to attach the generated session ID to the path of the URL. For example, we assign the session ID of `123456` to the URL `spacecraft-repl.com/123456`. With this, every room is identified by their path name. However, the problem  with this is that assets that are requested via the root path will also have to be forwarded manually. For instance, a client's request to fetch `/main.js` will not match `/123456` and will fail.

![path forwarding](https://docs.google.com/drawings/d/e/2PACX-1vSXRH02roO9RBQITOtlheiN8qaanmQx-IPmv6ThmfzAB6-eRcTPobjm0UGARUUORfb27TdBeXcKYf78/pub?w=960&h=540)
> An absence of session ID following the root path leads to confusion in our reverse proxy

There are certainly ways to get around this issue, such as to add some client-side logic to modify requests to include the session ID. For example, changing the request of `/main.js` to `/123456/main.js` enables our reverse proxy to capture the session ID and forwards it accordingly.

However, we chose not to go with this approach as it leads to unnecessary complexity in the client-side code. This leads to our next approach.

#### Subdomain forwarding
To get around this issue, we decide to work with subdomains instead. With this, a session ID of `123456` will be assigned instead to the URL of `123456.spacecraft-repl.com`. This ensures that the session ID can be read from the hostname, since hostnames are always consistent for each session. This means that any change in the path will not affect the original forwarding.

![subdomain forwarding](https://docs.google.com/drawings/d/e/2PACX-1vTcPVwBQa001D2GXjI30Xf0J5I9lTFS5_-i3wjumIieVXpWjwC6u8Qt_3zA6eDJufH00NCk3jyOUMGz/pub?w=960&h=540)
> With subdomains, the session ID is always read from the hostname, and it is never lost even if the path changes

#### Container Instantiation
With our URL generated, we can then map the URL to a designated container via its private IP address and port number. The flow of events are as follows:



<!-- Unfinished -->


## 8 Future Work

### 8.1 Improve User Experiences
Currently, when multiple users write code in our text editor on the front-end there is no distinction between user cursors. This can make it difficult to see the location of all the cursors or to tell which cursor belongs to which user as they type. To improve the collaboration experience, we want to assign each cursor a unique color and name, similar to a small tooltip icon. This will make it easier to distinguish where each cursor is located in the editor and who is writing what.

### 8.2 Support Low-Level Languages
While SpaceCraft supports Ruby, JavaScript, and Python, we would like to expand our list of supported languages to include low-level languages like Rust, Go, C/C++, or Java. The process to support these languages will be more involved than higher-level languages since we will need to:
- Take the user's input and write it as a file in our backend.
- Have the low-level language runtime compile the code in the file and save the result as a separate file.
- Parse the contents of the result file and stream it as output to the user.
- Clean up our backend by deleting these generated files.

This is process is a fair bit more complicated than how we've supported our current list of languages, and we're excited to tackle the challenge to expand the capabilities of SpaceCraft!


## 8 About the Team
Our team of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk software engineering, containers, or the web. We're always open to learning about new opportunities.

<!-- Place our pictures here with names, titles, location, and link to personal websites. -->

## References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend checkout out the resources below. They have been invaluable to our research and development.


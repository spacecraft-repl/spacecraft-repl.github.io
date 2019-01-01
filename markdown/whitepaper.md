
# 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node.js and deployed via Docker, with a client-server network architecture that communicates over WebSockets.

![demo](https://i.imgur.com/sAKUInM.gif)

SpaceCraft serves as a tool for developers to easily experiment with a programming language, while eliminating the burden of downloading and configuring the languages on their local machine. Furthermore, SpaceCraft makes pair-programming easy between interviewers and candidates, or with a small team of developers who want to share their experiences with a programming language.

The major challenges we faced were creating and managing server-side processes for executing code in the selected language runtime, allowing multiple clients to collaborate on the same REPL, and building a framework for security and resource usage with Docker containers.

In this case study, we'll detail our journey in building this project, the strategies we employed to synchronize collaborating clients in real-time, the security techniques we implemented to prevent malicious code, and our network architecture. We'll explore the choices we made to efficiently transfer user input and evaluated output between the clients and server, reduce our latency, and balance our resource usage across all our containers.

## 1.1 High-Level Goals
SpaceCraft's goals on the surface are simple. We aim to provide users with a choice of languages to code in and present both a terminal-like REPL and editor for them to write and evaluate their code. We also want users to be able to invite other users to join their session to collaborate on writing code in both the editor and REPL. This means that we will need to synchronize the displays among all collaborating users in real-time. When one user writes code or submits it for evaluation, all collaborating users should see the same state on their respective screens.

## 1.2 Challenges
In setting the above goals, we've introduced several challenges in our project that we will need to solve.
The biggest challenge is the security risk from providing users with a terminal-like REPL that directly connects to our back-end for code execution. This design opens the door for malicious code to be input by users directly into our system, making us vulnerable to a variety of exploits. 

There also comes the challenge of spreading our resources across multiple instances of our application. There is the chance that one user's code may require more resources than that of other users. If we don't account for this, then we may have a single instance hog resources away from other sessions and thus lower their performance.

So, we will need to:
- Scale our application to handle multiple sessions and isolate each user's session from the sessions of other users
- Prevent any malicious code from affecting our system.
- Manage the usage of our server's resources for each session so that one user's code doesn't affect other users.

In addition, we have the challenge of achieving high performance and low latency for the real-time code evaluation and display synchronization for our users. Since SpaceCraft aims to allow multiple users to collaborate and write code together in the same editor and REPL, we have to ensure that there is no noticeable lag in the synchronization of input and output, otherwise our users will have a frustrating experience working together. 

These are a lot of challenges to solve, and we need to start somewhere. Let's begin at a high-level with our network architecture, then step down one level to build our REPL and synchronize our input/output, and finish by drilling down into the details of handling the security and resource management of our project.

# 2 Network Architecture
In considering our network architecture, we need to make sure that our choice meets the following technical requirements:
- Scalable: able to handle multiple language runtimes
- Supports 3-5 users per session for collaboration
- Detects when a client disconnects so that we can free up resources for new users
- Allows bidirectional communication for clients to send and receive data at any given time

## 2.1 Problems with a Peer-to-peer Architecture
![peer-to-peer](https://docs.google.com/drawings/d/e/2PACX-1vQZTrLn7Z1h4BdZdZ6NdfMX52AEn9N3wpWseWSdfjEJQVv7Z0Rj8jVkz3D8dmkIA9u1_YWtZ1CzY-HR/pub?w=1439&h=517)
> A peer-to-peer network where clients communicate directly to one another

A peer-to-peer architecture allows clients to directly communicate with one another without having to go through a centralized server. The benefit of such a network architecture is that it enables decentralization of nodes, which removes a single point of failure and [shortens the distances between nodes](https://layr-team.github.io/layr-project/#decentralized-cloud-storage "Layr: A Decentralized Cloud Storage System"). With this, client connections will not require a full round-trip through a centralized server, thereby reducing the latency.

However, there are several disadvantages to a peer-to-peer architecture:
- It requires significant coordination between clients for state-synchronization, since there is no centralized authority to determine the final source of truth.
- REPL code evaluation has to be performed on the client-side, thereby increasing the overhead of clients. A client that has significant lower processing power may experience system overload and disconnect from its current session.
- Each client carries a burden of downloading and storing multiple language runtimes for code execution, which defeats our goal of building a collaborative REPL that requires no setup. This approach is not very scalable, as we'll [explore more in the following section](#24-where-should-we-execute-the-code).

With these disadvantages mentioned, we chose to employ a client-server architecture instead.

## 2.2 Client-server Architecture
![client-server](https://docs.google.com/drawings/d/e/2PACX-1vQo6W0USG30ETbTw7ztlMQ7Z24iQp9dT1-65CyZXbJdvZWflNiRAedbbhJyeArL40YQ7TNbIoEwN5at/pub?w=1440)
> A client-server architecture, where multiple clients are connected to a centralized server

We chose a client-server architecture in which users connect to a central server and start up a REPL session. Users who wish to collaborate can then connect to the same REPL session and have their input and output synchronized. A client-server architecture provides several benefits:
- A centralized server provides a single source of authority, thereby conflicts that arise from simultaneous updates can be easily resolved
- More readily scalable as all language runtimes can be managed and run in a single location
- It is easier to isolate and contain our application to prevent malicious code from affecting the host system

The trade-off of using a client-server architecture is that clients will not be able to communicate directly with one another. Since the communication has to be routed first through our server, a round-trip would be necessary for every client's request. Nevertheless, this fits our use case due to the benefits mentioned above.

## 2.3 Network Protocol
With our client-server architecture in mind, we have to decide on which network protocol that suits best for constructing a real-time collaborative environment.
### 2.3.1 HTTP
We initially started with using HTTP to have clients communicate with our server, but quickly discovered some issues with this approach:
- There is no way for our server to automatically detect a client disconnection. The server would need to send an HTTP request to ping the client and determine if a disconnection has occurred.
- There is a significant amount of overhead ([~200 bytes](http://www.diva-portal.se/smash/get/diva2:1133465/FULLTEXT01.pdf "Performance comparison of XHR polling,
Long polling, Server sent events and
Websockets by Rasmus Appelqvist,
Oliver Örnmyr")) with each HTTP request/response which adds up over time with multiple users collaborating in the same session.
- This overhead also adds up in the case of single users since our application sends a request to the server with each keypress as the user write code as part of our design to sync collaborating users.

While it is possible to improve the above issues with HTTP server-sent events, it does not address the case where a client decides to send data frequently, for which regular HTTP requests have to be made. To fully address the problems mentioned above, we need an alternative that could provide bidirectional communication between a client and server, that could also detect client disconnections and have a smaller overhead. The best solution that we found was WebSockets.

### 2.3.2 WebSockets
We used the library [Socket.io](https://socket.io/) to leverage WebSockets in SpaceCraft. The major benefit of using WebSockets is that it provides a bidirectional communication between the client and server over a single TCP connection. After an initial HTTP handshake to establish the TCP connection, our client and server will then be connected through WebSockets for further communication. This ensures that either the client or server can send information to the other when needed with an additional overhead of only [~10 bytes per message](http://www.diva-portal.se/smash/get/diva2:1133465/FULLTEXT01.pdf "Performance comparison of XHR polling,
Long polling, Server sent events and
Websockets by Rasmus Appelqvist,
Oliver Örnmyr"). This is a ~95% decrease from using HTTP, and particularly useful in our case where we continuously [stream data](#8-performance-benchmarking-streaming-vs-buffering-outputs) from the server to the clients.

![http vs websockets](https://docs.google.com/drawings/d/e/2PACX-1vQAdYwKH7kjzDDQv9GF-tpR9d2ZRK_vA661f2x3JPdTrPcE9c78WCl5rdyYW5XmyUy9wTYUlEZwQrEp/pub?w=1440)
> A full duplex persistent connection is possible with WebSockets. The connection stays open until either the client or server disconnects. Reference: [WebSockets - A Conceptual Deep-Dive](https://www.ably.io/concepts/websockets)

Additionally, since the TCP connection over WebSockets remains open until either the client or server disconnects we can easily know when a user disconnects from out application. This enables us to efficiently begin the container teardown process and free up resources for new users. Finally, WebSockets allows us to maintain 1024 or more connections per server as opposed to ~6 connections per server with HTTP. This enables us to scale our application more efficiently as our user base grows.

## 2.4 Where Should We Execute the Code?

![client-side server-side](https://docs.google.com/drawings/d/e/2PACX-1vSKVCKGZZHwgQFbXnMcyYpkhr4fJOUeeOxPp2zl1uLXM4nyxPOB7xT8gqMEkYZSlomKjDdk32voKaC6/pub?w=1440)

Now that we've established our network architecture and communications, we need to decide where our code should be executed: on the client or on the server?

### 2.4.1 Executing code on the client-side
Initially, we thought that we could execute on the client so that there is minimal latency between the user submitting code for evaluation and then receiving the result. Additionally, we could set-up a peer-to-peer architecture for collaborating users to sync input/output.

However, there are several problems with this approach. First, we face the burden of running an in-browser compiler, which can be slow and even cause the browser to hang. Second, this is not scalable because we would be relying on the client's computer resources for handling and running the language runtimes.

The storage requirement for each language ends up being ~50MB, and thus as we continue to support more languages in the future we would be expecting the client to handle increasing memory usage.

Finally, not all languages come with an in-browser compiler and thus we would need to figure out a way to compile these language runtimes into JavaScript ourselves.

Vincent Woo, Founder of Coderpad.io, in one of his [interviews](http://codeinsider.us/i/5.html) mentioned:
> “One day I sucked it up and I just realized that there was no way I could scale this completely in-browser execution out as far as I needed it to... What are you going to do, compile every programming runtime into JavaScript? Good luck.”

### 2.4.2 Solution: Executing code on the server-side
For all these reasons, we will need to execute our code on the server-side. This ends up making it easier to manage multiple runtimes and easier to scale since we can upgrade our server resources and have our memory and CPU more readily available than a client's. Furthermore, by relying on a central server, we can more easily handle conflicts due to concurrent edits. 

The tradeoff is that we will need to efficiently manager our server resources, along with facing increased latency and server costs. However, we feel that these tradeoffs are acceptable in order to meet our goals.

# 3 Building a REPL
Now that we've designed our architecture, our next task is to create a version of SpaceCraft that services a single user per session. Once that's complete, we can add mult-user collaboration. For now, we need to allow the user to:
- Select from a list of supported languages.
- Write code in the REPL, submit for evaluation by hitting Enter, and receive the result as output.
- Write code in the editor, submit for evaluation by clicking a Run button, and receive the result as output.
- Store state in the client, such as the current line of input for evaluation and the current language for UI display.

In SpaceCraft, a user makes a language selection from a drop-down menu which will automatically update the REPL to their chosen language runtime. They can then write code directly into the REPL for evaluation or into an embedded editor for writing larger programs.

When code is submitted for evaluation, our app will take the code as input and send it to our server for evaluation. Once this is complete, our server will send the result as output to the client, which is displayed in the user's REPL.

## 3.1 Creating the User Interface
SpaceCraft's user interface is created with [Xterm.js](https://github.com/xtermjs/xterm.js/) and [CodeMirror](https://codemirror.net/). Xterm is a terminal front-end component written in JavaScript that creates an emulated terminal for our REPL in which users can write their code and submit for evaluation. When a user hits Enter in the REPL, their code is sent as input to our server for evaluation, and the result is then sent back to be displayed in the REPL.

![front-end UI](https://docs.google.com/drawings/d/e/2PACX-1vT218z12UgSMqH_Yqbn-d-ZqFIhVvESDv5-8HeZebQsOoRhCxK6bjw7OYP0a9fiQWPzhiVBSWMob0l6/pub?w=1440)

CodeMirror is a versatile text editor implemented in JavaScript for the browser. It's specialized for writing and editing code and provides a familiar text editor experiences for developers. By leveraging Xterm.js and CodeMirror to create our user interface and receive input, our team was able to focus our efforts on developing a rich REPL experience for Ruby, JavaScript, and Python, along with a secure framework for handling malicious user input. So now we need to figure out how to handle a user's input and properly evaluate it on our backend.

## 3.2 Interacting with the REPL program on the Back-end
Since we want provide users with the ability to submit code remotely for server-side evaluation, we have to simulate the entire interaction with the REPL program ourselves. This is fundamentally different from the regular experience with a REPL program in which a user directly inputs code into an interactive REPL console like *irb* or *node*.

![local interaction](https://docs.google.com/drawings/d/e/2PACX-1vQOAjlP1_EdFI1Jk_8rRaA_ExbLCtqczdL6rsAXwedI7OnYP4ovCn1Z12BXkEYk4UOa-Cy3aU3ue0sb/pub?w=1440)
> A regular interaction between a user and a REPL program via a terminal

For our project, the interaction between the user and the underlying REPL program will have to be manually set-up through our application logic. Our application must be able to send inputs to the REPL program on the back-end and read any outputs after an evaluation is completed. This means that we have to also consider the complexity that comes with interacting with REPLs of different languages.

![simulated interaction](https://docs.google.com/drawings/d/e/2PACX-1vQ6MwTViENag3nS5sQ-cyiwE4lQbTO-oa8Dc5SMNRjqpDTejskWvnHRZOFTpp_whkr15GmjpjQ0gkX3/pub?w=1440)
> Our application has to properly write inputs to the underlying REPL program and read outputs from it

With this challenge in mind, we will explore three different approaches that can help set up our interaction with the REPL program.

### Approach #1: Interact with the language’s built-in REPL API library
Many languages provide APIs to access and interact with its native REPL program. Node.js for example, provides the `repl` module that allows developers to work directly with its API from within the application code. 

The problem with using language-specific APIs, however, is that we would have to write and run the application code in that language runtime. For each additional language supported, we would need to rewrite the same logic in that language. The complexity increases exponentially with each additional supported language.

Thus, our goal of supporting three languages, and potentially more in the future, does not benefit from this approach.

### Approach #2: Spawning a REPL Child Process and Interacting Directly with It
We could also make use of APIs that enable us to access the standard streams of a REPL child process. In particular, we are going to access the standard input (a writable stream) as well as the standard output (a readable stream) of the REPL child process. More info on working with streams can be found here: [Node.js Streams](https://medium.freecodecamp.org/node-js-streams-everything-you-need-to-know-c9141306be93#4fc8).

We can naively think that writing into the standard input would produce a desired output, however the output may hang. This can be seen in the gif below in which we are accessing the standard streams of a REPL process:

![shell-test-demo](https://i.imgur.com/apJCqSf.gif)

> *Notice that the output hangs while `stdin` is left open*
> *IRB produces a full output, while Node.js and Python do not*

There are two possible reasons as to why this may occur.

First, streams may be blocked when we try to read from the standard output. One problem is that the standard input may not send any data to the REPL process for evaluation until the [input stream is closed](https://stackoverflow.com/questions/9818534/why-is-it-necessary-to-close-standard-input-output-error-when-writing-a-daemon "Stack Overflow: 'Why is it necessary to close standard input/output/error when writing a daemon?'").

Second, interpreted languages are usually written in lower-level languages, and due to how the language interacts with the standard stream, it may be a cause of hanging outputs. For example, the C implementation of `read()` function would hang when we try to read from an output stream, until new data is being written to the corresponding input stream.

> If some process has the pipe open for writing and O_NONBLOCK is clear, `read()` shall block the calling thread until some data is written or the pipe is closed by all processes that had the pipe open for writing.

-- [read(3)Linux man page](https://linux.die.net/man/3/read)

![streams blocking](https://docs.google.com/drawings/d/e/2PACX-1vR4hvoZaifOI5Xh_BkDWiGcKP28pu8DCevtEJKMsi08O0fIaNozngsKoWNItFskmBjBMN8OURK9oOpP/pub?w=1440)

Although there are [techniques](http://eyalarubas.com/python-subproc-nonblock.html) to unblock the processes for reading or writing from the streams, the techniques are not universal on all languages. If we were to implement various techniques to get around this issue, our application's code complexity would increase significantly. Thus, this approach does not fit our use case.

### Approach #3 Interacting with a Pseudoterminal
The solution that we found to overcome this challenge is through the use of pseudoterminals. The basis of this approach is that REPL programs are inherently terminal-oriented programs, which means that they expect to connect and work with a terminal. The fundamental problem that we are trying to address here becomes:

**How can we enable a user to interact with a terminal-oriented program on a remote host?**

![remote interaction ?](https://docs.google.com/drawings/d/e/2PACX-1vSiAyIrp0gxipR4IAwjRFzwHDuBIMhNoM8Vzz9zEF2J0CsRviYUNhxP0kID5V-05NGp0cwsx6ZxP8Ik/pub?w=1440)
> Providing communication over a network solves part of the problem, but it does not address the connection of standard input, output and error to a terminal-oriented program

A terminal-oriented program expects a terminal to perform certain kinds of processing of its inputs and outputs. This is useful to prevent the default blocking of buffering during reads and writes from our application. The additional processing will also allow the generation of terminal-related signals (such as SIGINT) onto the program <sup>[[source]](https://www.oreilly.com/library/view/the-linux-programming/9781593272203/ch64.html "The Linux Programming Interface, Chapter 64, pages 1375-1377")</sup>. In other words, the terminal appropriately translates inputs and outputs between our application and the REPL program.

A pseudoterminal provides this missing piece, which is a terminal device that connects to our REPL program. In doing so, it acts a communication channel between our application code and the underlying REPL program so that they may be able to speak to each other.

![pseudo-terminal remote interaction](https://docs.google.com/drawings/d/e/2PACX-1vSHn46g_dV1eF_O5RU1fCG1jXXCU0JuJLf0qtigaZGKGrynvv9meoI7Rism-0qfwNLU52JUSn4wjGU9/pub?w=1440)
> Connecting the pseudoterminal with our application server and our REPL program solves the communication issues mentioned previously

This is useful since we can easily persuade our REPL program that its input is coming from a terminal, and thus allow us to gain the benefits of:
- offloading the burden of managing input and output streams of different REPL runtimes
- allowing sending of control sequences (such as Ctrl-C) to the REPL, effectively sending an interrupt signal to the runtime
- capturing full outputs from the REPL program, including colored outputs
- standardizing the way our application interacts with the different REPLs of supported languages, thereby increasing extensibility for adding more languages in the future

To demonstrate the advantages mentioned above, we have also made a recording of a coding example that illustrates the interaction with a pseudoterminal through the use of `node-pty` library:

![pty-demo](https://i.imgur.com/NZSzm7T.gif)
> *Notice that REPLs produce full outputs regardless of chosen runtime. Prompts and color outputs are also displayed.*

With these advantages mentioned, we can further reduce our code complexity since pseudoterminals provide a standardized way of handling inputs and outputs.

The trade-off of using a pseudoterminal is that there is a slight increase in overhead as we are adding an additional processing layer in between our application and the underlying REPL program. However, with all the benefits mentioned, this approach fits our use case.

# 4 Collaboration with Multiple Users
Now that we have built our REPL on the back-end, we need a way to synchronize the input and output of a session across collaborating users. This synchronization needs to occur for both the REPL and text editor components of the front-end.

We'll first handle the REPL synchronization, for which there are two main components: the current line of REPL input and the result of code evaluation as output.While it is possible to utilize external libraries to manage the synchronization of REPL inputs and outputs for us, we chose to build this feature ourselves from scratch. Our reasoning is so that we can:
- easily add new features that are not supported from the library, such as handling output overflow during an infinite loop
- control the flow of data (streaming vs. buffering data chunks) so that we can more easily optimize the flow of input/outputs to reduce latency

## 4.1 Syncing Output
To synchronize outputs, our application server broadcasts the evaluation outputs to currently connected clients. The flow of output synchronization is as follows:

![output sync evaluation](https://docs.google.com/drawings/d/e/2PACX-1vQpdFdytJndBFsKwvJTqgLZd6UhIe7dEY27olnXjDX5lo8BXocZN3xA1zbXFZMVkCW4m7h1h3kmOt3V/pub?w=1440)
1. Client requests a line of code to be evaluated
2. Application server receives line of code
3. Application server sends the line of code to the pseudoterminal that is connected to the REPL program.
4. The REPL program evaluates the line of code and sends the appropriate output data to the pseudoterminal.
5. Application server reads the evaluation outputs from the pseudoterminal.
  ![output sync broadcast](https://docs.google.com/drawings/d/e/2PACX-1vT1eaaey9-P8vNXGVRrCeTvEr1lMDlr8OrHSZZAHfjNMT9mb3CfQtCqR7neKcKu-nXjqAN0A3R5SBgQ/pub?w=1440)

6. Application server broadcasts and streams the outputs to all connected clients.
7. Clients receive the outputs and display them on the front-end terminal.

## 4.2 Syncing Input
Since we are building our input synchronization feature from scratch, we need to manually handle the current line of input. We chose to track the current line of input on the client-side so that local edits can be updated and displayed immediately. With this approach however, there is a possibility that conflicts will occur if two clients happened to edit their inputs at the same time. Nonetheless, this is generally not an issue for our use case, as we'll explore more in the following section.

Our input-syncing mechanism consists of the following steps:

![input sync 1](https://docs.google.com/drawings/d/e/2PACX-1vT7AnhrTSfePigTwPc-Igul7a6A9k3fkygmmfoGylp85kB_BNDc2AKKv8qNPZJrs68VcHa3KM6ooAnK/pub?w=1172&h=621)

1. The state of the input line before any changes.
2. The user presses a key on the REPL front-end terminal. The state is updated in the user's client.
3. The user's client sends a message with the current input line to inform the application server that the current line has been changed.
  ![input sync broadcast](https://docs.google.com/drawings/d/e/2PACX-1vTbNvqeH7bv8wC0VfljTRm3PSQxhyRBvdKdaQlcpR-PpHeiIpyYiOiUH9UINaafsSfpiJwM3LcH9cFH/pub?w=1305&h=624)

4. Our application server broadcasts a message that includes the current line and prompt to other clients. The prompt is retrieved from the most recent output cache. It is used to rewrite the entire terminal line in the following step.

5. When other clients receive the message, their local states are updated to include the current line of input.

6. The client updates its UI by first clearing the last line of the terminal. Since the prompt is also erased, it has to rewrite the prompt before writing the current input line.


## 4.3 Handling Conflicts in Shared Editing
Giving users the option to collaborate in real-time means that potential conflicts can occur if multiple users type at the same time. This may occur if our server receives updates in a different order than they were sent due to one client being closer to the server than another. When conflicts happen, both clients [may not converge](https://conclave-team.github.io/conclave-site/#what-is-a-real-time-collaborative-text-editor]) to the same state. 

For example, when a user inserts a character at position index 0 and another user deletes at the same position, and both operations happen at the same time, we need to resolve any conflicts so that both clients will arrive at the same state.

### 4.3.1 Conflict Resolution in REPL terminal
In our REPL terminal, we will rely on [eventual consistency](https://en.wikipedia.org/wiki/Eventual_consistency) to resolve conflicts. This means that if both clients happen to type on the REPL terminal at the same time, the last update that is received by our application will take precedence. This is also known as "last write wins".

![last write wins](https://docs.google.com/drawings/d/e/2PACX-1vQWK_l-v1bmvCcqjVJNHi1StdP7avDVq833bcppB_FXXAYJ84ilmOzXLs4HBsCIaas5EiPYvbij79X3/pub?w=1302&h=690)

1. Both users in client A and B edit at the same time. Client A's update will arrive first due to a lower latency than client B's
2. Since client B's update is received last, it takes precedence and overwrites the previous update.
3. Our application server broadcasts the last update to the other clients.

We chose not to employ any Operational Transformation or Conflict-free Replicated Data Type (CRDT) techniques for resolving potential conflicts in our REPL terminal input, due to unnecessary code complexity as well as additional server overhead. Our reasoning is that we expect users to take turns instead of competing against each other when evaluating inputs in our REPL.

### 4.3.2 Conflict Resolution in Text Editor
Now that we've handled the REPL input and output synchronization, let's turn to the text editor. The text editor component will allow multiple users to write code at the same time. We can expect there to be a higher likelihood that a conflict will occur in the editor because most people will write their code in the editor and then submit for evaluation. We can reasonably expect that both users will type at the same time, and if they happen to type into each other's code by accident, we would like to make sure that:
- concurrent insertion converge to the same result, regardless of order in which they are applied
- duplicated delete operations are only applied once to produce the same result

![conflict in concurrent edit](https://docs.google.com/drawings/d/e/2PACX-1vQkm0mEhBrkFW1rqPl6ZAu7UJCQ_5Q0IUazA5lxt3JtZxWDCJgbhUHB1OVr_dh_3LLxAMlFeUPG29p2/pub?w=1305&h=594)
> Simultaneous insertion and deletion produce different results. Source: [Conclave](https://conclave-team.github.io/conclave-site/)

To solve this issue, we utilized [Yjs](https://github.com/y-js/yjs), a shared editing framework that utilizes Conflict-Free Replicated Data Type (CRDT) for conflict resolution. We also chose Yjs because of its WebSockets adapter that integrates nicely into our application.

However, the trade-off of utilizing Yjs is that it increases memory consumption on the server-side. This is likely due to the caching of replicated data structures that are required for CRDTs to work. Nonetheless, we chose to use it since it provides a low-latency and conflict-free collaborative environment for our users.

# 5 Security & Resource Management with Containers
At this point, we've succeeded in taking a user's code and evaluating it in a language runtime while also synchronizing displays across collaborating users. Now, we need to consider the security and resource management challenges mentioned at the start of this case study.

Since we are connecting users with a pseudoterminal that allows execution of user input on our server, we leave ourselves and our users open to the risk of any malicious code submitted directly into our backend. We will need to think of a way to protect both ourselves and our users.

## 5.1 Naive Approach: Check User Input Against List
Our initial idea was to run a check on all user input against a list of possibly malicious commands. For example, let's say a user attempts to submit a command like `system rm -rf /` into the Ruby REPL. We can check their input against a list of Linux commands and match `rm -rf /` which would lead our system to halting the execution of this input. 

While this sounds like a straightforward solution, it's hindered by the fact that we would need to consider and plan for all possible inputs that could be malicious. This is an enormous task that would require a significant amount of research to make sure that we don't miss every possibility, and is compounded by any language-specific inputs for our supported languages. It also addes an additional processing step to our application logic which would negatively impact our user's experienced latency.

## 5.2 Solution: Isolation via Containers

Instead, we can isolate each user's session, and thereby isolate their code, within our application. This will help contain any malicious code away from our host system and other users. With this isolation comes several challenges:
- How do we provide each user with an isolated, complete copy of our application to evaluate their code?
- How do we handle any malicious code submitted by the user, which may be able to break out of isolation?
- How do we manage our backend computing resources for isolated user so that one user's code evaluation doesn't rob resources from another user?
- How do we enable multiple users to collaborate in the same isolated environment?

We chose to implement containers to address these challenges. Through containers, we are able to provide an isolated, complete copy of our application for each user. We can effectively separate users from each other, easily add layers of security to contain malicious code, and ensure that one container only uses a set amount of resources. Let's start with how we can segment users by container.

## 5.3 Segmenting Users by Container
The core idea behind containers is that you create a single unit of software that is encapsulated and can be deployed anywhere. By putting your software and dependencies in a container and operating within in, we can effectively deploy our container on any system without worrying about the host system configurations. In addition, containers provide a level of isolation from the rest of the system that enable security measures to be placed to prevent the software in a container from affecting the rest of the system and other users' sessions.

<!-- Docker logo -->

To start, we used Docker to create our containers which will each hold an entire copy of our application code. Containers are created using an image, which provides the details of all the software and dependencies that should be included in the container. Once we need to instantiate a new container, we simply execute a run command that instantiates a container using the image as a blueprint.

![docker image](https://docs.google.com/drawings/d/e/2PACX-1vRGOfNrPPMkt8RdA_USJSal6Kcatzr9TmoH9zjjSybDbygU6HizCDJraLG358rO84oplyJPwrJug5wM/pub?w=1305&h=674)

Thus, our new user workflow is as follows:
1. a new user makes a request to our application.
2. when our server receives the request, a new container is created based on an image that contains our application, required dependencies and operating system.
3. the server then redirects the user's request to the container.
4. the user then establishes an active connection with container which serves as their session and they can begin coding away with our REPL.

With this design, each user is given their own isolated environment to write and evaluate their code. If any user attempts to submit malicious code to destroy our application, they will only be affecting their copy of our application code within the container and our host system is unaffected.

![isolated attack](https://docs.google.com/drawings/d/e/2PACX-1vRtVA-YL9rfCMfvPq6Wm5uOFp611rGOf0KscBC38Q-KjnNnebUiwgRSa7XSTeQ_g9LX7r9nJ-SPH3MY/pub?w=1440&h=740)
> When a container is compromised due to a malicious attack only the session that is associated with the container will be affected.

However, this is only a start as there are ways for users to break out of their containers and we need to add some more security measures. Also, at this point each container can draw upon all of the host server's resources to evaluate the user's code. This is not ideal since one user's code could be more computationally intensive and consume more CPU and memory resources away from other users, thereby worsening their session's performance. Let's see how we can fix this!

## 5.4 Securing Containers
The main issue of security within containers is when users are given root access, which is actually the default setting with Docker. This allows users to have complete access to the files within the container and the ability to do some truly malicious activity. 

### 5.4.1 Remove Root-level Access
The first step to securing our container is to remove the default root-level access and prevent users from being able to execute harmful commands such as `rm -rf /` in our application.

To achieve this, we can simply create a user with restricted permissions that will run as the default profile for any user in our container. The restrictions include making them a non-root user and creating a special `bin` folder from which they access their terminal commands. This special `bin` folder will have a limited number of commands for use and will not include commands such as `touch`, `mkdir`, `rm`, and so on.

### 5.4.2 Strengthen Isolation with Container Runtime Sandbox
While containers provide some isolation between our host system and application, containers [are not inherently a sandbox](https://cloud.google.com/blog/products/gcp/open-sourcing-gvisor-a-sandboxed-container-runtime). Applications that run in containers access system resources in the same way that non-containerized applications do, which is by making privileged system calls directly to the host kernel. What this means is that container escape is still possible with a successful privilege escalation attack. An example would be the [Dirty Cow](https://en.wikipedia.org/wiki/Dirty_COW) (copy-on-write) vulnerability that gives attackers write access to a read-only file, essentially giving them access to root.

![weak isolation](https://docs.google.com/drawings/d/e/2PACX-1vR-tTR66OqNAFUnZv7ulqSTCqI0RDZgIIkinKbuVXn0cb2O-wZscKZ6_7HRmkgXyWvYUdGbqJ96Wufm/pub?w=1306&h=659)

> Our current container architecture. Docker alone provides weak isolation, where all system calls made by our application are accepted by the host kernel. Source: [gVisor Github](https://github.com/google/gvisor)

While we can run containers within a virtual machine to provide strong isolation from the host system, it also means a larger resource footprint (gigabytes of disk space) and slower start-up times.

A container runtime sandbox provides similar level of isolation with virtual machines while minimizing resource footprint. A runtime sandbox achieves this by intercepting application system calls and acts as the guest kernel. On top of that, it also employs rule-based execution to limit the application's access of resources. With this, any attempted privilege system calls will be intercepted, before it has a chance to reach our host system.

We chose to leverage [gVisor](https://github.com/google/gvisor), an open-sourced container runtime sandbox developed by Google, because it provides the security benefits mentioned above and integrates well with Docker.

![givsor strong isolation](https://docs.google.com/drawings/d/e/2PACX-1vS8cMB6fkTIJYk1bVVIcqKC6fhCFEejAdtvQ4pMjBFiNO8fto76FhIadoxFpDaRXbR87k-gGlvEquj6/pub?w=1307&h=712)

> Unprivileged access is enforced through the use of a container sandbox runtime, which provides a much stronger isolation between our application and the host kernel.

The trade-offs of using such a container runtime sandbox however is that it significantly increases memory consumption, thus reducing the maximum number of containers that we can run per host system. Here are the results based on our testing:

| RAM size (GB) | Default Docker runtime | gVisor runtime |
| -------- | -------- | -------- |
| 1     |   18 containers   | 14 containers     |
| 4 | 103 containers | 50-60 containers |

Nevertheless, gVisor greatly strengthens our security model, thus we are willing to sacrifice memory availability in favor of a stronger security.

With these measures in place, we have effectively made a user profile that is incapable of accessing or changing the files in the container, along with making it a lot harder for users to submit malicious code.

## 5.5 Managing Container Resources
Now that we've tackled the security issues of using containers, we need to turn our attention to managing the container's resources. By default, each container is able to consume the entire CPU and memory of their host server to complete their processes. While this makes sense at a high level as you want each container to have sufficient resources to complete their work, it becomes a liability when a user submits code for evaluation that is computationally intensive.

For example, a user in one container may write a program that requires a large amount of mathematical calculations, string processing, or infinite loops that cause a spike in CPU usage which causes a drop in performance for other containers. Or a user may input large amounts of data into the text editor that eat away at the available memory in our host server and leave little remaining for other users. To combat these issues and ensure that each container only uses a reasonable amount of resources, we can use Docker's cgroups (control groups) to place a resource limit on each container.

At its core, a cgroup is simply a limitation placed on an application or container to a specific set of resources. By specifying this limitation when creating a container, we can easily set the max CPU or memory allowed for use by a container. So if we want to spin up a container that can only use 20% of our total CPU and 100MBs of our total memory, all we need to do is include `--memory=100m -it --cpus=".2"` within our `docker run` command. And just like that, we've handled any potential hogging of resources by a single container and ensured stable performance across the board for our users.


# 6 Connecting Users to Containers
At this point, we've successfully built our collaborative REPL and isolated complete instances of our application in containers. Now, we need to evaluate how we can connect clients to their associated container on the server, as well as allowing a user to invite other users to collaborate in their session.

## 6.1 Naive Approach: Port Forwarding
Each container will have a unique IP address and port number associated with it, and the question becomes how we can route a user's request for a session to a container and form a connection. We first considered using port forwarding, which takes the initial HTTP request from the client and forwards it to the address and port number of a ready-to-use container.

| Session | Open Port on Host | Container's IP & port |
| -------- | -------- | -------- |
| 1     | `domain.com:5000`     | `172.17.0.2:3000`     |
| 2 | `domain.com:5001` | `172.17.0.3:3000` |
| 3 | `domain.com:5002` | `172.17.0.4:3000` |

> Mapping multiple open ports to container destinations

This technique is simple since it's a direct mapping of a client to a container destination. However, this technique is flawed by being a security risk since the port numbers are pre-determined. By running a port scanner to probe for open ports, a user could potentially access any session. This leads to a complete lack of privacy for our users who wish to collaborate only with the people they invite to join their session.

We need a better approach that can protect our users' privacy and mask the connections to our containers. Thankfully, this can be achieved with a reverse proxy.

## 6.2 Solution: A Reverse Proxy
The idea behind a reverse proxy is that there is some middleware that sits between our clients and our server which serves as an intermediary between the two. When a client sends an HTTP request to our server, a reverse proxy will receive that request and communicate with our server for the necessary information. The server will respond to the reverse proxy with the container's IP address and port number, which will then take that information and forward the client's request to that container for connection. Thus, our reverse proxy will handle all the traffic between our clients and server.

![reverse proxy](https://imgur.com/eIBtN6g.png)

While this may sound like a roundabout way of handling a request and response, the benefit is that we can abstract away the connection of addresses and ports to ensure the privacy of our sessions. From the client's perspective, they are connected to the appropriate container and don't know the exact IP address or port number of the container or our host system.

Furthermore, our proxy server can assign random URLs to created sessions, thereby preventing other unwanted users from gaining access to a current session through port sniffing or guessing pre-determined URLs. We will detail how this works in the following section.

| Session | Generated URL | Container's IP & port |
| -------- | -------- | -------- |
| 1 | `a9ca01.domain.com` | `172.17.0.2:3000` |
| 2 | `6d9e89.domain.com` | `172.17.0.3:3000` |
| 3 | `71b7e0.domain.com` | `172.17.0.4:3000` |

> Mapping multiple randomly generated URLs to container destinations ensures privacy of sessions. [Read more about why we chose subdomains instead of paths](#712-path-based-url-forwarding).

In our application, the reverse proxy will handle the initial HTTP handshake that is needed to connect a client with a container for their session. Once this handshake is complete, a WebSockets connection is created between the client and container that will persist for the remainder of the session until all connected clients disconnect.

<!-- ![websockets](https://i.imgur.com/rjdOm1W.png) -->

Along with solving our privacy concerns, a reverse proxy provides our application with greater scalability as our user base grows. It can serve as a load balancer as we add more servers and it can provide content caching to reduce latency for particular content outside of establishing the client-container connection.

# 7 Session Management
In order to connect different groups of users to different sessions, our reverse proxy server must also be responsible to:
- initialize a session and start a new container
- forward requests to the appropriate container
- destroy a session and its associated container

Since implementing the above features requires flexibility and customization, we opted out of using an established proxy server such as Nginx. Instead, we chose to built our reverse proxy from scratch using VanillaJS, with only the following essential libraries to help us get started:
- [node-http-proxy](https://github.com/nodejitsu/node-http-proxy) to forward both HTTP and WebSocket requests
- [Dockerode](https://github.com/apocas/dockerode), a Node.js Docker API to work with containers

The idea behind session initialization is that we need to:
1. Generate a unique URL when client requests the root path
2. Instantiate a container to start an instance of our application
3. Map the generated URL to the newly created container's private IP and port number
4. Redirect client to the new URL
5. Forward the client's requests to the associated container destination

![session init](https://docs.google.com/drawings/d/e/2PACX-1vT08FXIXx9S2tGgcrvqFST81Hd9pseJEFt5TwVC4xomHkaOqanD-M6unI8pCIRO7X3RTJ0GA2V6mGj3/pub?w=1305&h=570)

> A request to the root path will start a new container. The client is then redirected to the newly generated URL in order to access our application.

We will detail the interesting challenges that we face from building such a reverse proxy server.

## 7.1 Generating Unique URL
The basic idea behind preventing users from being able to guess a URL is by randomizing it with a sufficiently large number generator. For this, we utilized a UUID generator to generate our session ID. At our current scale, the first 6 digits of the UUID is sufficient, as it already provides 16,777,216 possibilities. With our random number in place, we are ready to generate the full URL.

### 7.1.2 Path-based URL forwarding

Our initial approach is to attach the generated session ID to the path of the URL. For example, we assign a session ID of `123456` to the URL `domain.com/123456`. With this, every session can be identified by their path name. However, the problem is that assets like JavaScript, CSS files or Socket.io connections that are requested via the root path will not automatically receive the session ID as part of its path name. For instance, a client's request to fetch `domain.com/main.js` will cause our reverse proxy to assume `"main.js"` as the session ID, thus the request will fail. The following explanation illustrates how this happens:

![path forwarding](https://docs.google.com/drawings/d/e/2PACX-1vSXRH02roO9RBQITOtlheiN8qaanmQx-IPmv6ThmfzAB6-eRcTPobjm0UGARUUORfb27TdBeXcKYf78/pub?w=1440&h=810)

1. Client requests `domain.com/123456`
2. Our reverse proxy forwards the request to the appropriate container destination
3. Our containerized application serves the first asset file: `index.html` - it contains a `<script>` tag that initiates the fetching of `/main.js`
4. Our reverse proxy receives the request to GET `/main.js`
5. Since there are no session associated with an ID of ``"main.js"``, our reverse proxy responds with a 404 status

In fact, we explored ways to get around this issue. The first solution is to add some client-side logic to modify requests to include the session ID. For example, changing the request of `/main.js` to `/123456/main.js` enables our reverse proxy to capture the session ID and to forward it accordingly. 

The second solution is to read the `Referer` header of each request to obtain the previous URL that includes the session ID. With the session ID obtained, our reverse proxy server can forward the request to the appropriate destination container.

However, we chose not to go with these approaches as it leads to unnecessary complexity in the client-side code. Furthermore, the `Referer` header may not always give us the expected URL that contains the session ID, particularly when working with Socket.io. Since directly solving these problems require some degree of request manipulation while adding dependencies on the client-side, we opt for the approach of subdomain forwarding due to its simplicity.

### 7.1.3 Subdomain forwarding
Through the use of subdomains, the session ID will be a part of the hostname instead of the path. For instance, a session ID of `123456` forms a subdomain URL of `123456.domain.com`. This ensures that the session ID can be read from the hostname, regardless of any change in the path name such as `123456.domain.com/main.js`. The following breakdown explains how this is handled:

![subdomain forwarding](https://docs.google.com/drawings/d/e/2PACX-1vTcPVwBQa001D2GXjI30Xf0J5I9lTFS5_-i3wjumIieVXpWjwC6u8Qt_3zA6eDJufH00NCk3jyOUMGz/pub?w=1440&h=810)
> With subdomains, the session ID is always read from the hostname regardless of any change in the path name

1. Client requests the session through the URL `123456.domain.com`
2. Our reverse proxy forwards the request to the appropriate container destination based on the session ID of `123456`
3. Our containerized application responds with `index.html`
4. Client requests to fetch `123456.domain.com/main.js`
5. Our reverse proxy forwards the request appropriately by retrieving the session ID `123456` from the host name
6. The container responds with the requested asset

The trade-off with using subdomains it may be confusing in terms of user experience, since subdomains are generally used to create different sites based on different business needs.

## 7.2 URL Mapping to Designated Container
With our URL generated, we then have to start a Docker container with our running application instance. This is achieved by using the Dockerode API to interact with Docker directly.

Once the container is started, we can then inspect the container to retrieve its IP address. We can then map the URL to a designated container via its IP address and port number. The port number is always the listening port on our Node.js application server. The flow of events are as follows:
1. The URL is saved as a key in the hash table
2. The container's IP address and ID are saved as an object. The object is then assigned as the corresponding property value.

```javascript
sessions = {
  '123456.spacecraft-repl.com': {
    ip: '172.17.0.2:3000',
    containerId: 'a9405c025dc4...'
  },
  'abc123.spacecraft-repl.com': {
    ip: '172.17.0.3:3000',
    containerId: '...'
  }
}
```

3.   With the hash table in place, we can retrieve the designated container's IP in O(1) time given the hostname of a request.

Now, we can finally forward clients' requests to the appropriate container.

## 7.3 Destroying a Session
With our session initialization process complete, we now need to consider the session teardown process. Once all clients have left a session, we want to start breaking down the remaining container so that we can free up the allocated resources for new sessions. This is preferred over connecting new users to a used container since there may be some remaining artifacts leftover in the session from the previous users, and we instead want to present a clean slate for new users.

To initiate the tear down process, we need to determine if an application instance has no clients connected to it. We can easily tell if a client has disconnected from a session with WebSockets since Socket.io provides a disconnect event that fires upon client disconnection. But what happens if a client leaves their session before completing their connection to a container, like in the case of closing their browser early?

To handle this case, we can check whether there are any connected clients to a container after a certain timeout. While it is easy to detect that within our application server, how do we notify our reverse proxy server? To do this, we'll have our application server communicate with our reverse proxy through HTTP requests. The diagram below illustrates the flow of events during a teardown.

![destroy session](https://docs.google.com/drawings/d/e/2PACX-1vTHvG1C5YQke_0kwYAKCy3nVea_iqqXv5uXVh9bWTQgMqfQzhwoLj4yUS3RIIlFMf6i2E9MhqLXOIkw/pub?w=1440&h=810)

1. A session is initialized with a running container.
2. Our reverse proxy server submits a POST request to the newly created container along with the `sessionURL` as the request body. The `sessionURL` is saved within a hash table to ensure there is no attempt to assign a `sessionURL` that is in use.
3. We set up a heartbeat mechanism in our application server to continuously detect the number of connected clients. In any 10 seconds interval that no client is connected to our application server, it will submit a DELETE request to the `sessionURL`.
4. Our reverse proxy receives the DELETE request and stops the container that is associated with the `sessionURL` to free up resources.
5. The `sessionURL` is removed from the hash table.

# 8 Performance Benchmarking: Streaming vs. Buffering Outputs
A REPL program sends outputs in the form of chunks of data. For each evaluation, our application would receive several to many smaller chunks of output data.

To demonstrate this, let's evaluate the code `[1,2,3].map(String)` on the Node.js REPL. We can reasonably expect the final output to be:

```
> [1,2,3].map(String)
[ '1', '2', '3' ]
>
```

However, since we are writing and reading data directly to and from a pseudoterminal, the evaluation result is written out through the standard output (a readable stream). This means that the first chunk of data available to be read from the readable stream may not contain our full output.

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

## 8.1 Buffering Outputs
With this effect, it makes sense to concatenate all chunks before sending it as a complete response. This is known as [output buffering](http://web.archive.org/web/20101216035343/http://dev-tips.com/featured/output-buffering-for-web-developers-a-beginners-guide).

After buffering output, it would look something like:

```
[1,2,3].map(String)\r\n[ '1', '2', '3' ]\r\n> 
```

The advantage to this in our use case is that we can easily parse out the current prompt depending on the current runtime (`>` for Node.js, `irb(main):XXX:0>` for Ruby and `>>>` for Python) on the client-side. The prompt is useful for re-writing the entire terminal line when syncing with other clients.

Since chunks of data arrive in different intervals (around 1-4 ms in between), we would set a maximum wait time of 5 ms every time a new data chunk is received. If no new data is received within the 5 ms, we conclude that the output is finished and send the complete buffered output to the client.
The trade-off here is that the buffering costs additional wait time.

## 8.2 Streaming Outputs
Our initial approach of buffering outputs seem to work fine. Nonetheless, we found out that we could parse out the prompt on the server-side instead by caching the last chunk of data received. An example data chunk would be `=> 123\r\nirb(main):003:0> `, by caching this data chunk, we can easily parse out the `irb(main):003:0> ` prompt.
With this, it is no longer necessary to buffer outputs. Instead, we could stream the outputs as-is to the client. The benefit of this is that it not only removes any additional processing, but also simplifies our code logic by avoiding any use of `setTimeout` or `setInterval`.

## 8.3 Results and Analysis
With these two approaches in mind, we decided to run some benchmarking so that we can compare the performance between them. We utilized Artillery, a load testing toolkit to measure the performance of both approaches.

Our benchmarking setup involves connecting 20 virtual users one at a time to our server, with each submitting 5 evaluation requests, thereby totaling 100 requests per test.

The results show that streaming has a slightly lower latency, due to the fact that no wait time is necessary before sending the first output:

| Server Location  |  Median Latency with Buffering Enabled (ms)  | Median Latency with Streaming (ms) | Difference |
| --- | --- | --- | --- |
| localhost |  12.3 | 2.1 | 10.2 |
| remote, near (NYC to NYC) | 21.3 |  15.2 | 6.1 |
| remote, far (NYC to SF) | 89.3 | 78.9 | 10.4 |

The results provide some perspectives on further optimizations that we can make. For example, if we require some heavy string processing on the client-side, then it make sense to employ the buffering approach since sacrificing a ~10 ms wait time would not be much of an issue. However, in our use case, we employ the streaming approach since it is acceptable to display output data to the client without any pre-processing. With this, we can reduce latency while simplifying our code logic.

# 9 Future Work

## 9.1 Improve User Experiences
Currently, when multiple users write code in our text editor on the front-end there is no distinction between user cursors. This can make it difficult to see the location of all the cursors or to tell which cursor belongs to which user as they type. To improve the collaboration experience, we want to assign each cursor a unique color and name, similar to a small tooltip icon. This will make it easier to distinguish where each cursor is located in the editor and who is writing what.

## 9.2 Allow Code Upload and Download
There may be instances in which a user needs to leave their session but would like to download and save their code onto their local machine. Additionally, some users may have written code in their code editor and would like to upload it into their session of SpaceCraft. To accomodate these use cases, we'd like to add the ability for users to click a button and download the code from our text editor to be saved on their local machine. We'd also like to add a second button which upon being clicked will allow users to choose a file on their local machine and upload it's contents into our text editor.

## 9.3 Support Low-Level Languages
While SpaceCraft supports Ruby, JavaScript, and Python, we would like to expand our list of supported languages to include low-level languages like Rust, Go, Crystal, or C/C++. The process to support these languages will be more involved than higher-level languages since we will need to:

- Take the user's input and write it as a file in our backend.
- Have the low-level language runtime compile the code in the file and save the result as a separate file.
- Parse the contents of the result file and stream it as output to the user.
- Clean up our backend by deleting these generated files.

This is process is a fair bit more complicated than how we've supported our current list of languages, and we're excited to tackle the challenge to expand the capabilities of SpaceCraft!

## 9.4 Implement a Request Queue
Currently, our system architecture has a reverse proxy handling all user requests and forwarding them to the appropriate containers. However, we’ve noticed that when a large number of users submit a request at the same time, our reverse proxy can struggle to handle the load and fail.

To prevent this from occurring, we aim to implement a request queue which will take each HTTP request and store it until our reverse proxy is ready to handle the request. While this will reduce the load on our reverse proxy, our users will likely experience a greater latency between requesting to connect to our application and actually connecting to their container.

However, we believe this is an acceptable consequence since the part of our application with the greatest performance and lowest latency should be the actual REPL and editor. Once the user is connected to their container, the experienced latency for writing and evaluating code is significantly small with no noticeable lag.


# About the Team

[![team photos](/images/team-combined.jpg)](/team)

**[Our team](/team)** of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk about software engineering, containers, or the web. We're all open to learning about new opportunities!

# References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend that you checkout out the resources below. They have been invaluable to our research and development.

## Collaborative REPL/Editors

- [Conclave: A private and secure real-time collaborative text editor](https://conclave-team.github.io/conclave-site/)
- [Yjs: Near Real-Time Peer-to-Peer Shared Editing on Extensible
Data Types](https://github.com/y-js/yjs/files/1752526/YjsPaper.pdf)
- [A simple approach to building a real-time collaborative editor](http://digitalfreepen.com/2017/10/06/simple-real-time-collaborative-text-editor.html)
- [Using locking mechanism to prevent conflicts between edits. “Collaborative Real Time Coding or How to Avoid the Dreaded Merge”](https://arxiv.org/pdf/1504.06741.pdf)
- [Opal: Ruby in the Browser: a Ruby to JavaScript source-to-source compiler used in TryRuby](https://opalrb.com/)

## HTTP vs. WebSockets & Network Architecture

- [Layr: A Decentralized Cloud Storage System](https://layr-team.github.io/layr-project/)
- [Performance comparison of XHR polling, Long polling, Server sent events and Websockets](http://www.diva-portal.se/smash/get/diva2:1133465/FULLTEXT01.pd)
- [HTTP vs. WebSockets: A performance comparison](https://blog.feathersjs.com/http-vs-websockets-a-performance-comparison-da2533f13a77)
- [Do you really need WebSockets?](https://blog.stanko.io/do-you-really-need-websockets-343aed40aa9b)
- [WebSockets vs. Server-Sent Events/EventSource](https://stackoverflow.com/questions/5195452/websockets-vs-server-sent-events-eventsource)
- [A Beginner’s Guide to HTTP/2 and its Importance](https://www.advancedwebranking.com/blog/beginners-guide-to-http2/)


## Containers

- [Docker Security Best-Practices](https://dev.to/petermbenjamin/docker-security-best-practices-45ih)
- [Open-sourcing gVisor, a sandboxed container runtime](https://cloud.google.com/blog/products/gcp/open-sourcing-gvisor-a-sandboxed-container-runtime)
- [Why it is recommended to run only one process in a container?](https://devops.stackexchange.com/questions/447/why-it-is-recommended-to-run-only-one-process-in-a-container)
- [Processes In Containers Should Not Run As Root](https://medium.com/@mccode/processes-in-containers-should-not-run-as-root-2feae3f0df3b)
- [Security and Virtual Machines](https://pubs.vmware.com/vsphere-4-esx-vcenter/index.jsp?topic=/com.vmware.vsphere.server_configclassic.doc_40/esx_server_config/security_for_esx_systems/c_security_and_virtual_machines.html)


## Psuedoterminals and Shell Processes

- [Node.js Child Processes: Everything you need to know](https://medium.freecodecamp.org/node-js-child-processes-everything-you-need-to-know-e69498fe970a)
- [How do you pipe input and output to and from an interactive shell?](https://stackoverflow.com/questions/16502170/how-do-you-pipe-input-and-output-to-and-from-an-interactive-shell?rq=1)
- [Non blocking reading from a subprocess output stream in Python](http://eyalarubas.com/python-subproc-nonblock.html)
- [read(3) - Linux man page](https://linux.die.net/man/3/read)
- Advanced Programming in the UNIX Environment, W. Richard Stevens, Addison-Wesley, 18th Printing, 1999, page 417


## Reverse Proxy and Port Forwarding

- [Port Forwarding](https://en.wikipedia.org/wiki/Port_forwarding)
- [Reverse Proxy and HTTP Redirects](https://docs.trafficserver.apache.org/en/4.2.x/admin/reverse-proxy-http-redirects.en.html)
- [Reverse vs. Forward Proxy Server](https://www.incapsula.com/cdn-guide/glossary/reverse-proxy.html)


## Books

- [High Performance Browser Networking, Ilya Grigorik](https://hpbn.co/)
- Advanced Programming in the UNIX Environment, W. Richard Stevens, Addison-Wesley, 18th Printing, 1999
- [The Linux Programming Interface, Michael Kerrisk, October 2010](https://nostarch.com/tlpi)

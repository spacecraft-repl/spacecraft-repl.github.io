<!-- Insert SpaceCraft logo either above, below, or next to title -->
# SpaceCraft: A Real-Time, Collaborative REPL and Code Editor

# 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node.js and Docker, with clients and server communicating over WebSockets.

SpaceCraft aims to provide a tool which developers can use to easily experiment with a programming language, while eliminating the burden of downloading and configuring the languages on their local machine. Furthermore, our real-time collaborative REPL encourages easy pair-programming between interviewers and candidates, or between a small team of developers who wanted to share their experiences on a programming language.

The major challenges we faced were creating and managing server-side processes for executing code in the selected language runtime, allowing multiple clients to collaborate on the same REPL, and building a framework for security and resource usage with Docker containers.

In this case study, we'll detail our journey in building this project, the strategies we employed to synchronize collaborating clients in real-time, the security techniques we implemented to prevent malicious code, and our final networked solution. We'll explore the choices we made to efficiently transfer user input and evaluated output between the clients and server, reduce our latency, and balance our resource usage across containers.

## 1.1 High-Level Goals
SpaceCraft's goals on the surface are simple. We provide users with a choice of languages to code in and present both a terminal-like REPL and editor for them to write and evaluate their code. Additionally, a user can invite other users to join their session to collaborate on writing code in the editor and REPL. Thus, when one user write code or submits code for evaluation, all collaborating users will see their code and executed code on their screen in real-time.

Since we are providing users with a terminal-like REPL on the client-side that directly connects to our back-end for code execution, we know that we will need to handle any potentially malicious input from users who aim to exploit our project. Therefore, we need to:
- Isolate each user's session from the sessions of other users (non-collaborating users.)
- Prevent any malicious code from affecting our system.
- Manage the usage of our server's resources for each session so that one user's code doesn't affect other users.

# 2 Building a REPL
Our first task is to create a version of SpaceCraft that services a single user per session. This version should allow the user to:
- Select from a list of supported languages.
- Write code in the REPL, submit for evaluation by hitting Enter, and receive the result as output.
- Write code in the editor, submit for evaluation by clicking a Run button, and receive the result as output.
- Store state in the client, such as the current line of input for evaluation and the current language for UI display.

In SpaceCraft, a user makes a language selection from a drop-down menu which will automatically update the REPL to their chosen language's runtime. They can then write code directly into the REPL for evaluation or into an embedded editor for writing larger programs. When code is submitted through either the REPL or by clicking a Run button for the editor, SpaceCraft will take the code as input and send it to our back-end for evaluation. Once the code has been evaluated, our back-end will send the result as output to the client, which then will be displayed on the user's REPL.

## 2.1 Creating the User Interface

## 2.2 Interacting with the REPL program on the Back-end
When we provide users the ability to submit code remotely to be evaluated on our server, we have to simulate the entire REPL experience ourselves. This is different from an off-line interaction, where the user interacts directly with an interactive REPL console (such as the Node.js REPL).

In fact, the interaction between the user and the underlying REPL program will have to be manually set-up through our application logic. Our application must be able to send inputs to the REPL program, wait for the evaluations to complete and then read any outputs from the program that will be sent to the user. The complexity increases as we deal with REPL programs of different languages which are implemented differently in nature.

We will explore three different approaches which can help in simulating a REPL to the user.

### Interact with the language’s built-in REPL API library
Many languages provide APIs to access and interact with its native REPL program. Node.js for example, provides the `repl` module that allows developers to work directly with its API from within the application code. 

The problem with using language-specific APIs, however, is that we would have to write and run the application code in that language's runtime. For each additional language supported, we would need to re-write the same logic in that language. The complexity increases exponentially with the number of languages supported.

Thus, our goal of supporting three languages, and potentially more in the future, does not benefit from this approach.

### Spawning a REPL Child Process and Interacting Directly with It
We could also make use of APIs that enable us to access the standard streams of a REPL child process. In particular, we are going to access the standard input (a writable stream) as well as the standard output (a readable stream) of the REPL child process. For further reading on streams, check out [Node.js Streams](https://medium.freecodecamp.org/node-js-streams-everything-you-need-to-know-c9141306be93#4fc8).

We can reasonably expect that everything that is written to the standard input of the REPL process will be evaluated, and the corresponding results will be available to be read from the standard output.

However, streams may be blocked when we try to read from the standard output. One problem is that the standard input may not send any data to the REPL process for evaluation until the input stream is closed. [Advanced Programming in the UNIX Environment", W. Richard Stevens, Addison-Wesley, 18th Printing, 1999, page 417]

!(input blocking)[https://imgur.com/6BeNWWn]

Another problem is that the reading function would hang when trying to read from an output stream until new data is present. The read(3) linux man page states that:

> if some process has the pipe open for writing, read() shall block the calling thread until some data is written or the pipe is closed by all processes that had the pipe open for writing.

!(stdin closed)[https://imgur.com/xCrsC2Y]

Although there are [techniques](http://eyalarubas.com/python-subproc-nonblock.html) to unblock the processes for reading or writing from the streams, the techniques are not universal on all languages. We chose not to continue this approach as any additional language supported would increase the complexity.

### Interacting with a Pseudo-terminal
To interact with an interactive program (such as a REPL), we need to persuade the program that its input is coming from a terminal by connecting its standard input/output to a pseudo-terminal. A pseudo-terminal emulates a command line interface within our application, so that our application will (*think*)[https://github.com/Microsoft/node-pty] that it is interacting with a terminal and will be able to send control sequences in the form of string data type.

!(pty)[https://imgur.com/HhkrErY]

The Linux manual page explains this stating that anything that is written to the pseudo-terminal is provided to the process as though it was input typed on the terminal. For example, writing the interrupt character to the pseudo-terminal would cause an interrupt signal to be generated for our REPL child process 45.

With this, our application will not need to manually handle the child process' input/output streams. Our application can also easily interact with the program by sending Ctrl-C instead of manually sending signals to the REPL program to abort an evaluation (such as terminating an infinite loop). Furthermore, our application will automatically capture all escape codes for colored text output that will be displayed on our browser terminal.

The trade-off of using a pseudo-terminal is that there is a slight increase in overhead as we are adding an additional processing layer in between our application and the underlying REPL child process. However, with all the benefits mentioned, this approach fits our use case.



# Network Architecture

## Client-server Architecture

## WebSockets

# 3 Utilizing Containers

## 3.1 Segmenting Users by Container

## 3.2 Securing Containers

## 3.3 Managing Container Resources


# 4 Collaboration with Multiple Users

## 4.1 Connecting Multiple Users to the Same Container

## 4.2 Syncing Input

### Getting the Current Prompt

## 4.3 Syncing Output

## 4.4 Handling REPL Conflict Resolution

# 5 Optimizations

## 5.1 Streaming vs. Buffering Outputs
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
With this effect, it makes sense to concatenate all chunks before sending it as a complete response. This is known as **output buffering**. [Output Buffering for Web Developers](http://web.archive.org/web/20101216035343/http://dev-tips.com/featured/output-buffering-for-web-developers-a-beginners-guide)

After buffering output, it would look something like:

```
[1,2,3].map(String)\r\n[ '1', '2', '3' ]\r\n> 
```

The advantage to this in our use case is that we can easily parse out the current prompt depending on the current runtime (`>` for Node.js, `irb(main):XXX:0>` for Ruby and `>>>` for Python) on the client-side. The prompt is useful for re-writing the entire terminal line when syncing with other clients.

However, buffering outputs cost additional processing time. Since chunks of data arrive in different paces (around 1-4 ms in between), we would set a maximum wait time of 5 ms every time a new data chunk is received. If no new data is received within the 5 ms, we conclude that the output is finished and we can send the complete buffered output to the client.

### Streaming Outputs
Our initial approach of buffering outputs seem to work fine. However, we found out that we could parse out the prompt on the server-side instead by caching the last chunk of data received. An example data chunk would be `=> 123\r\nirb(main):003:0> `, by caching this data chunk, we can easily parse out the `irb(main):003:0> ` prompt.
With this, it is no longer necessary to buffer outputs. Instead, we could stream the outputs as-is to the client. The benefit of this is that it not only removes any additional processing, but also simplifies our code logic by omitting any use of `setTimeouts` or `setIntervals`.

With these two approaches in mind, we decided to run some benchmarking to confirm that streaming is the better approach. We utilized Artillery, a load testing toolkit to measure the performance of both approaches.

Our benchmarking set-up involves connecting 20 virtual users one at a time to our server, with each submitting 5 evaluation requests, thereby totaling 100 requests per test.

The results clearly show that the streaming approach is the winner:

| Server Location  |  Median Latency with Buffering Enabled (ms)  | Median Latency without Buffering (ms) | Difference |
| --- | --- | --- | --- |
| localhost |  12.3 | 2.1 | 10.2 |
| remote, near (NYC to NYC) | 21.3 |  15.2 | 6.1 |
| remote, far (NYC to SF) | 89.3 | 78.9 | 10.4 |

While a 10 ms improvement in latency may not seem like a huge difference, it represents more than 10% of the total time before a response is received, after an evaluation request has been sent. Our goal here is to minimize the latency to maintain a real-time experience for users, therefore it makes sense to employ streaming instead of buffering.

## 6 Future Work

### 6.1 Improve User Experiences

### 6.2 Support Low-Level Languages


## 7 About the Team
Our team of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk software engineering, containers, or the web. We're always open to learning about new opportunities.

<!-- Place our pictures here with names, titles, location, and link to personal websites. -->

## References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend checkout out the resources below. They have been invaluable to our research and development.

